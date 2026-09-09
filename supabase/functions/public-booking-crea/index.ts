/**
 * public-booking-crea — prenotazione dalla pagina pubblica /prenota/:slug.
 *
 * Prima la pagina scriveva direttamente in `appointments` con la chiave anonima:
 * niente email di conferma al cliente, niente avviso al titolare, e il controllo
 * "slot libero" girava nel browser (due persone sullo stesso orario passavano
 * entrambe). Qui tutto avviene lato server con la service role:
 *   1. il calendario deve essere pubblico e attivo;
 *   2. l'orario deve stare in una fascia di disponibilita' del giorno;
 *   3. non deve accavallarsi ad altri appuntamenti ne' agli impegni del
 *      titolare (Google, Apple, Outlook);
 *   4. si crea l'appuntamento, si conferma al cliente e si avvisa il titolare.
 *
 * Pubblica per necessita' (la usa un visitatore non autenticato): non accetta
 * company_id ne' owner dal chiamante, li prende dal calendario.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { sincronizzaCalendariEsterni } from "../_shared/appuntamentiPubblici.ts";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import {
  minutiDa as minuti, orarioDa as orario, dataEstesa, esc, creaIcs, allegatoIcs,
  nuovoToken, urlGestione, blocchettoDettagli, bottoneGestione,
} from "../_shared/appuntamentiPubblici.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const data = String(body?.date ?? "").trim();          // yyyy-MM-dd
    const ora = String(body?.time ?? "").trim().slice(0, 5); // HH:mm
    const nome = String(body?.first_name ?? "").trim().slice(0, 80);
    const cognome = String(body?.last_name ?? "").trim().slice(0, 80);
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 160);
    const telefono = String(body?.phone ?? "").trim().slice(0, 40);
    const note = String(body?.notes ?? "").trim().slice(0, 1000);

    if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(ora)) {
      return json({ error: "Dati della richiesta incompleti." }, 400);
    }
    if (!nome) return json({ error: "Inserisci il nome." }, 400);
    if (!email && !telefono) return json({ error: "Inserisci almeno email o telefono." }, 400);
    if (email && !EMAIL_RE.test(email)) return json({ error: "Indirizzo email non valido." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. calendario pubblico e attivo
    const { data: cal, error: calErr } = await admin
      .from("marketing_calendars")
      .select("id, name, description, company_id, duration_minutes, owner_id, default_meeting_provider, is_active, booking_slug, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day")
      .eq("booking_slug", slug).eq("is_active", true).maybeSingle();
    if (calErr) throw calErr;
    if (!cal) return json({ error: "Calendario non trovato o non piu' attivo." }, 404);

    const durata = cal.duration_minutes || 30;
    const inizio = minuti(ora);
    const fine = inizio + durata;
    const fineStr = orario(fine);

    // 2. preavviso minimo (default 2 ore): niente prenotazioni "fra cinque minuti"
    const adessoRoma = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const quando = new Date(`${data}T${ora}:00`);
    const preavviso = Math.max(0, Number(cal.min_notice_minutes ?? 0));
    if (quando.getTime() < adessoRoma.getTime() - 60_000) {
      return json({ error: "Questo orario e' gia' passato: scegline un altro." }, 409);
    }
    if (quando.getTime() < adessoRoma.getTime() + preavviso * 60_000) {
      const ore = Math.round(preavviso / 60);
      return json({ error: `Serve un preavviso di almeno ${preavviso < 60 ? `${preavviso} minuti` : ore === 1 ? "un'ora" : `${ore} ore`}: scegli un orario piu' avanti.` }, 409);
    }

    // 3. dentro una fascia di disponibilita' del giorno (la data specifica vince)
    const giorno = new Date(`${data}T12:00:00Z`).getUTCDay();
    const { data: fasce, error: fErr } = await admin
      .from("marketing_calendar_availability")
      .select("day_of_week, start_time, end_time, specific_date")
      .eq("calendar_id", cal.id).eq("is_enabled", true);
    if (fErr) throw fErr;
    const perData = (fasce ?? []).filter((f: any) => f.specific_date === data);
    const valide = perData.length ? perData : (fasce ?? []).filter((f: any) => f.specific_date === null && f.day_of_week === giorno);
    const dentro = valide.some((f: any) => inizio >= minuti(String(f.start_time).slice(0, 5)) && fine <= minuti(String(f.end_time).slice(0, 5)));
    if (!dentro) return json({ error: "Questo orario non e' fra quelli disponibili." }, 409);

    // 4. nessun altro appuntamento sovrapposto sullo stesso calendario
    const { data: presi, error: pErr } = await admin
      .from("appointments")
      .select("appointment_time, appointment_end_time")
      .eq("calendar_id", cal.id).eq("appointment_date", data)
      .not("status", "eq", "annullato")
      .or("is_blocked_slot.is.null,is_blocked_slot.eq.false");
    if (pErr) throw pErr;
    // I margini valgono da entrambe le parti: un appuntamento nuovo deve stare
    // lontano dagli altri di buffer_before/after minuti.
    const bufPrima = Math.max(0, Number(cal.buffer_before_min ?? 0));
    const bufDopo = Math.max(0, Number(cal.buffer_after_min ?? 0));
    const occupato = (presi ?? []).some((a: any) => {
      const s = minuti(String(a.appointment_time ?? "00:00").slice(0, 5));
      const e = a.appointment_end_time ? minuti(String(a.appointment_end_time).slice(0, 5)) : s + durata;
      return (inizio - bufPrima) < (e + bufDopo) && (fine + bufDopo) > (s - bufPrima);
    });
    if (occupato) return json({ error: "Questo orario e' appena stato occupato. Scegline un altro." }, 409);

    // Tetto di appuntamenti al giorno su questo calendario.
    if (cal.max_per_day && (presi ?? []).length >= Number(cal.max_per_day)) {
      return json({ error: "Per questa giornata non ci sono piu' posti: scegli un altro giorno." }, 409);
    }

    // 5. impegni del titolare: Google, Apple e Outlook
    if (cal.owner_id) {
      const { data: pref } = await admin
        .from("user_calendar_preferences").select("block_busy_slots").eq("user_id", cal.owner_id).maybeSingle();
      if (pref?.block_busy_slots !== false) {
        const giornoIso = `${data}T00:00:00.000Z`;
        const domaniIso = `${data}T23:59:59.999Z`;
        const { data: impegni } = await admin
          .from("unified_calendar_busy_slots")
          .select("start_at, end_at")
          .eq("user_id", cal.owner_id)
          .lt("start_at", domaniIso).gt("end_at", giornoIso);
        const inizioMs = new Date(`${data}T${ora}:00`).getTime();
        const fineMs = inizioMs + durata * 60_000;
        const sovrapposto = (impegni ?? []).some((b: any) => {
          const s = new Date(b.start_at).getTime(), e = new Date(b.end_at).getTime();
          return inizioMs < e && fineMs > s;
        });
        if (sovrapposto) return json({ error: "Questo orario risulta occupato nel calendario. Scegline un altro." }, 409);
      }
    }

    // 6. crea l'appuntamento
    const conMeet = cal.default_meeting_provider === "google_meet";
    const token = nuovoToken();
    const origine = String(body?.origin ?? req.headers.get("origin") ?? "https://app.ediliziaincloud.com").replace(/\/+$/, "");
    const linkGestione = urlGestione(origine, token);
    const titolo = `${nome} ${cognome}`.trim() || "Prenotazione";
    const { data: creato, error: insErr } = await admin.from("appointments").insert({
      calendar_id: cal.id,
      company_id: cal.company_id,
      appointment_date: data,
      appointment_time: `${ora}:00`,
      appointment_end_time: `${fineStr}:00`,
      title: `${titolo} — ${cal.name}`,
      description: [
        email && `Email: ${email}`,
        telefono && `Tel: ${telefono}`,
        note && `Note: ${note}`,
        `Prenotato da /prenota/${slug}`,
      ].filter(Boolean).join("\n"),
      appointment_type: conMeet ? "videocall" : "appuntamento",
      status: "confermato",
      assigned_to: cal.owner_id || null,
      created_by: "00000000-0000-0000-0000-000000000000",
      meeting_provider: conMeet ? "google_meet" : "none",
      meeting_status: conMeet ? "pending" : "none",
      manage_token: token,
      booking_email: email || null,
    }).select("id").single();
    if (insErr) throw insErr;

    // Sul Google/Apple Calendar del responsabile, subito: prima l'appuntamento
    // restava solo in EiC e il commerciale non lo vedeva sul telefono.
    if (creato?.id) {
      await sincronizzaCalendariEsterni({ azione: "push-event", appointmentId: creato.id, companyId: cal.company_id, userId: cal.owner_id ?? null });
    }

    const quandoTesto = `${dataEstesa(data)} alle ${ora}`;
    const esito = { appointment_id: creato?.id ?? null, email_cliente: false, avviso_titolare: false };

    // 7. conferma al cliente (best-effort: l'appuntamento resta preso comunque)
    if (email) {
      try {
        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a">
            <p>Ciao ${esc(nome)},</p>
            <p>l'appuntamento è confermato.</p>
            ${blocchettoDettagli(quandoTesto, durata, cal.name)}
            ${cal.description ? `<p style="color:#475569">${esc(cal.description)}</p>` : ""}
            <p>In allegato trovi il file da aprire per aggiungerlo al tuo calendario.</p>
            ${bottoneGestione(linkGestione)}
            <p style="color:#64748b;font-size:13px">Se il pulsante non funziona, apri questo indirizzo:<br>${linkGestione}</p>
          </div>`;
        const testo = `Ciao ${nome},\n\nl'appuntamento è confermato.\n\nQuando: ${quandoTesto}\nDurata: ${durata} minuti\nArgomento: ${cal.name}\n\nPer spostarlo o disdirlo: ${linkGestione}\n\nA presto`;
        const ics = creaIcs({
          uid: `${creato?.id ?? token}@ediliziaincloud.com`,
          titolo: cal.name,
          descrizione: cal.description ?? null,
          dataIso: data, ora, durataMin: durata,
          partecipante: email,
        });
        const r = await sendEmailUnified({
          companyId: cal.company_id,
          stream: "transactional",
          to: email,
          subject: `Appuntamento confermato — ${quandoTesto}`,
          html, text: testo,
          templateName: "public_booking_conferma",
          attachments: [allegatoIcs(ics)],
          adminClient: admin,
          metadata: { appointment_id: creato?.id, calendar_id: cal.id, booking_slug: slug },
        });
        esito.email_cliente = !(r && r.ok === false);
      } catch (e) {
        console.error("[public-booking-crea] conferma al cliente non inviata:", e instanceof Error ? e.message : e);
      }
    }

    // 8. avviso al titolare
    try {
      const contatti = [email && `email ${email}`, telefono && `tel ${telefono}`].filter(Boolean).join(" · ");
      const testoAvviso = `${titolo} ha prenotato "${cal.name}" per ${quandoTesto}${contatti ? ` (${contatti})` : ""}.${note ? ` Note: ${note.slice(0, 200)}` : ""}`;
      if (cal.company_id === PLATFORM_COMPANY) {
        await avvisaSuperAdmin(admin, {
          tipo: "prenotazione_pubblica",
          titolo: `Nuovo appuntamento: ${cal.name}`,
          testo: testoAvviso,
          url: "/admin/marketing/calendario",
          tag: `prenotazione:${creato?.id ?? slug}`,
        });
        esito.avviso_titolare = true;
      }
      if (cal.owner_id) {
        const { data: prof } = await admin.from("profiles").select("email, first_name").eq("id", cal.owner_id).maybeSingle();
        if (prof?.email) {
          await sendEmailUnified({
            companyId: cal.company_id,
            stream: "transactional",
            to: prof.email,
            subject: `Nuovo appuntamento — ${quandoTesto}`,
            html: `<div style="font-family:system-ui,sans-serif"><p>${esc(testoAvviso)}</p></div>`,
            text: testoAvviso,
            templateName: "public_booking_avviso_titolare",
            replyTo: email || undefined,
            adminClient: admin,
            metadata: { appointment_id: creato?.id, calendar_id: cal.id },
          });
          esito.avviso_titolare = true;
        }
      }
    } catch (e) {
      console.error("[public-booking-crea] avviso al titolare non inviato:", e instanceof Error ? e.message : e);
    }

    return json({ ok: true, ...esito });
  } catch (e) {
    console.error("[public-booking-crea]", e);
    return json({ error: e instanceof Error ? e.message : "Errore durante la prenotazione" }, 500);
  }
});
