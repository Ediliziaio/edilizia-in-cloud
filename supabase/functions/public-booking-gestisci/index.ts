/**
 * public-booking-gestisci — il cliente sposta o disdice il suo appuntamento
 * dal link personale ricevuto via email (/appuntamento/<token>).
 *
 * Senza questo, chi non poteva piu' venire semplicemente non si presentava:
 * lo slot restava occupato e nessuno lo sapeva. Il token e' l'unica chiave:
 * non serve account, e vale solo per quell'appuntamento.
 *
 * Azioni: "annulla" e "sposta" (verso un orario che rispetta le stesse regole
 * della prenotazione: disponibilita', margini, preavviso, impegni del titolare).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import { whatsappAppuntamento } from "../_shared/messaggiAppuntamento.ts";
import { sendOpenWaMessage, OPENWA_PLATFORM_COMPANY_ID } from "../_shared/openwaSend.ts";
import { opzioniMittenteCalendario } from "../_shared/mittenteCalendario.ts";
import { slotLiberiCalendario } from "../_shared/calendarioPrenotazione.ts";
import {
  minutiDa, orarioDa, dataEstesa, esc, creaIcs, allegatoIcs,
  urlGestione, blocchettoDettagli, bottoneGestione, sincronizzaCalendariEsterni,
} from "../_shared/appuntamentiPubblici.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const azione = String(body?.action ?? "").trim();      // "annulla" | "sposta"
    if (!token || !/^[a-f0-9]{16,64}$/.test(token)) return json({ error: "Link non valido." }, 400);
    if (!["annulla", "sposta"].includes(azione)) return json({ error: "Azione non riconosciuta." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: app, error: appErr } = await admin
      .from("appointments")
      .select("id, calendar_id, company_id, contact_id, appointment_date, appointment_time, appointment_end_time, status, title, booking_email, assigned_to, meeting_url")
      .eq("manage_token", token).maybeSingle();
    if (appErr) throw appErr;
    if (!app) return json({ error: "Appuntamento non trovato: il link potrebbe essere scaduto." }, 404);
    if (["annullato", "cancelled"].includes(String(app.status))) {
      return json({ error: "Questo appuntamento è già stato disdetto." }, 409);
    }
    if (String(app.status) === "completato") {
      return json({ error: "Questo appuntamento si è già svolto." }, 409);
    }

    const { data: cal } = await admin
      .from("marketing_calendars")
      .select("id, name, description, company_id, duration_minutes, owner_id, booking_slug, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day, slot_interval_min, link_videochiamata, whatsapp_numero_id, firma_messaggi, mittente_nome, mittente_email")
      .eq("id", app.calendar_id).maybeSingle();
    if (!cal) return json({ error: "Calendario non disponibile." }, 404);

    const durata = cal.duration_minutes || 30;
    const adessoRoma = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const oraAttuale = String(app.appointment_time ?? "00:00").slice(0, 5);
    const inizioAttuale = new Date(`${app.appointment_date}T${oraAttuale}:00`);
    // Si puo' intervenire fino a un'ora prima: dopo, si telefona.
    if (inizioAttuale.getTime() < adessoRoma.getTime() + 60 * 60_000) {
      return json({ error: "Manca meno di un'ora: chiama o rispondi all'email di conferma, facciamo prima." }, 409);
    }

    const quandoVecchio = `${dataEstesa(app.appointment_date)} alle ${oraAttuale}`;
    const emailCliente = app.booking_email || "";
    const origine = String(body?.origin ?? req.headers.get("origin") ?? "https://app.ediliziaincloud.com").replace(/\/+$/, "");
    const link = urlGestione(origine, token);

    // ── DISDETTA ────────────────────────────────────────────────────────────
    if (azione === "annulla") {
      const motivo = String(body?.reason ?? "").trim().slice(0, 500);
      const { error } = await admin.from("appointments").update({
        status: "annullato",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "cliente",
        description: [app.title, motivo && `Disdetto dal cliente: ${motivo}`].filter(Boolean).join("\n"),
      }).eq("id", app.id);
      if (error) throw error;
      // Via dal Google/Apple Calendar del responsabile: prima l'evento restava
      // li', e il commerciale si presentava a un appuntamento disdetto.
      await sincronizzaCalendariEsterni({ azione: "delete-event", appointmentId: app.id, companyId: app.company_id, userId: app.assigned_to ?? cal.owner_id ?? null });

      if (emailCliente) {
        try {
          const ics = creaIcs({
            uid: `${app.id}@ediliziaincloud.com`, titolo: cal.name, dataIso: app.appointment_date,
            ora: oraAttuale, durataMin: durata, partecipante: emailCliente, annullato: true, sequenza: 1,
          });
          await sendEmailUnified({
            companyId: cal.company_id, stream: "transactional", to: emailCliente,
            subject: `Appuntamento disdetto — ${quandoVecchio}`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a">
                <p>Come richiesto, l'appuntamento di <strong>${esc(quandoVecchio)}</strong> è stato disdetto.</p>
                <p>Quando vuoi puoi prenotarne un altro da <a href="${origine}/prenota/${esc(cal.booking_slug)}">questa pagina</a>.</p>
              </div>`,
            text: `L'appuntamento di ${quandoVecchio} è stato disdetto.\n\nPer prenotarne un altro: ${origine}/prenota/${cal.booking_slug}`,
            templateName: "public_booking_disdetta",
            attachments: [allegatoIcs(ics)],
            adminClient: admin,
            ...(await opzioniMittenteCalendario(admin, cal, app.contact_id)),
            metadata: { appointment_id: app.id },
          });
        } catch (e) { console.error("[gestisci] email disdetta:", e instanceof Error ? e.message : e); }
      }
      await avvisaTitolare(admin, cal, app, `${app.title} ha DISDETTO l'appuntamento di ${quandoVecchio}.${motivo ? ` Motivo: ${motivo}` : ""}`);
      return json({ ok: true, stato: "annullato" });
    }

    // ── SPOSTAMENTO ─────────────────────────────────────────────────────────
    const data = String(body?.date ?? "").trim();
    const ora = String(body?.time ?? "").trim().slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(ora)) return json({ error: "Scegli il nuovo giorno e orario." }, 400);

    const inizio = minutiDa(ora);
    const fine = inizio + durata;
    const nuovoInizio = new Date(`${data}T${ora}:00`);
    const preavviso = Math.max(0, Number(cal.min_notice_minutes ?? 0));
    if (nuovoInizio.getTime() < adessoRoma.getTime() + preavviso * 60_000) {
      return json({ error: "Il nuovo orario è troppo vicino: scegline uno più avanti." }, 409);
    }

    // L'orario nuovo deve essere fra quelli liberi del generatore condiviso
    // (calendarioSlot.ts, via slotLiberiCalendario): un posto solo per la griglia
    // del passo, le fasce, i margini, il tetto giornaliero e gli impegni esterni
    // del titolare. L'appuntamento che si sta spostando non blocca se stesso.
    const { slot: liberi } = await slotLiberiCalendario(admin, cal.id, data, {
      companyId: cal.company_id,
      adesso: new Date(),
      escludiAppuntamentoId: app.id,
    });
    if (!liberi.includes(ora)) {
      return json({ error: "Questo orario non è più disponibile: scegline un altro." }, 409);
    }

    const { error: updErr } = await admin.from("appointments").update({
      appointment_date: data,
      appointment_time: `${ora}:00`,
      appointment_end_time: `${orarioDa(fine)}:00`,
      status: "confermato",
      reminder_24h_at: null,
      reminder_1h_at: null,
      reminder_5m_at: null,
      // Lo spostamento lo comunica già questa funzione (email e WhatsApp):
      // col timbro il giro dei promemoria non rimanda anche la conferma.
      conferma_inviata_at: new Date().toISOString(),
    }).eq("id", app.id);
    if (updErr) throw updErr;
    // Lo spostamento arriva anche sul calendario esterno (se l'evento non c'era
    // ancora, update risponde 404 e il giro dei 15 minuti lo crea).
    await sincronizzaCalendariEsterni({ azione: "update-event", appointmentId: app.id, companyId: app.company_id, userId: app.assigned_to ?? cal.owner_id ?? null });

    const quandoNuovo = `${dataEstesa(data)} alle ${ora}`;
    const linkCall = app.meeting_url || cal.link_videochiamata || null;
    if (emailCliente) {
      try {
        const ics = creaIcs({
          uid: `${app.id}@ediliziaincloud.com`, titolo: cal.name, descrizione: cal.description ?? null,
          dataIso: data, ora, durataMin: durata, partecipante: emailCliente, sequenza: 1, luogo: linkCall,
        });
        await sendEmailUnified({
          companyId: cal.company_id, stream: "transactional", to: emailCliente,
          subject: `Appuntamento spostato — ${quandoNuovo}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a">
              <p>L'appuntamento è stato spostato.</p>
              ${blocchettoDettagli(quandoNuovo, durata, cal.name)}
              <p style="color:#64748b">Era previsto per ${esc(quandoVecchio)}.</p>
              ${linkCall ? `<p>Link della videochiamata: <a href="${esc(linkCall)}">${esc(linkCall)}</a></p>` : ""}
              ${bottoneGestione(link)}
            </div>`,
          text: `L'appuntamento è stato spostato a ${quandoNuovo} (era ${quandoVecchio}).${linkCall ? `\n\nLink della videochiamata: ${linkCall}` : ""}\n\nPer spostarlo ancora o disdirlo: ${link}`,
          templateName: "public_booking_spostato",
          attachments: [allegatoIcs(ics)],
          adminClient: admin,
          ...(await opzioniMittenteCalendario(admin, cal, app.contact_id)),
          metadata: { appointment_id: app.id },
        });
      } catch (e) { console.error("[gestisci] email spostamento:", e instanceof Error ? e.message : e); }
    }
    // WhatsApp dello spostamento, dal numero del calendario (solo piattaforma).
    if (cal.whatsapp_numero_id && app.contact_id && cal.company_id === OPENWA_PLATFORM_COMPANY_ID) {
      try {
        const { data: contatto } = await admin.from("marketing_contacts")
          .select("first_name, phone, optout_whatsapp, unsubscribed").eq("id", app.contact_id).maybeSingle();
        if (contatto?.phone && !contatto.optout_whatsapp && !contatto.unsubscribed) {
          const testo = whatsappAppuntamento("spostato", {
            nome: contatto.first_name ?? "", calendario: cal.name, dataIso: data, ora, durataMin: durata,
            linkCall, linkGestione: link, firma: cal.firma_messaggi,
          });
          const w = await sendOpenWaMessage(admin, {
            to: contatto.phone, contactId: app.contact_id, text: testo,
            numberId: cal.whatsapp_numero_id, bypassQuietHours: true, simulateTyping: false,
          });
          if (!w.ok) console.warn("[gestisci] WhatsApp spostamento non inviato:", w.error);
        }
      } catch (e) { console.error("[gestisci] WhatsApp spostamento:", e instanceof Error ? e.message : e); }
    }
    await avvisaTitolare(admin, cal, app, `${app.title} ha SPOSTATO l'appuntamento: da ${quandoVecchio} a ${quandoNuovo}.`);
    return json({ ok: true, stato: "spostato", date: data, time: ora });
  } catch (e) {
    console.error("[public-booking-gestisci]", e);
    return json({ error: e instanceof Error ? e.message : "Operazione non riuscita" }, 500);
  }
});

/** Avvisa chi riceve l'appuntamento: notifica se e' della piattaforma, email al titolare. */
async function avvisaTitolare(admin: any, cal: any, app: any, testo: string): Promise<void> {
  try {
    if (cal.company_id === PLATFORM_COMPANY) {
      await avvisaSuperAdmin(admin, {
        tipo: "prenotazione_pubblica_modificata",
        titolo: `Appuntamento modificato: ${cal.name}`,
        testo,
        url: "/admin/marketing/calendario",
        tag: `prenotazione-mod:${app.id}`,
      });
    }
    if (cal.owner_id) {
      const { data: prof } = await admin.from("profiles").select("email").eq("id", cal.owner_id).maybeSingle();
      if (prof?.email) {
        await sendEmailUnified({
          companyId: cal.company_id, stream: "transactional", to: prof.email,
          subject: `Appuntamento modificato — ${cal.name}`,
          html: `<div style="font-family:system-ui,sans-serif"><p>${esc(testo)}</p></div>`,
          text: testo,
          templateName: "public_booking_avviso_modifica",
          adminClient: admin,
          ...(await opzioniMittenteCalendario(admin, cal, null, false)),
          metadata: { appointment_id: app.id },
        });
      }
    }
  } catch (e) {
    console.error("[gestisci] avviso al titolare:", e instanceof Error ? e.message : e);
  }
}
