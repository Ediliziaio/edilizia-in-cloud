/**
 * appuntamenti-promemoria — conferma e promemoria degli appuntamenti al
 * cliente (cron ogni 5 minuti).
 *
 * Email (come prima): il giorno prima (23-24 ore) e un'ora prima (45-60
 * minuti), a chi ha prenotato dalla pagina pubblica. Come nel «Flusso
 * Appuntamenti»: chi fissa per meno di 24 ore dopo non riceve quello del
 * giorno prima, chi fissa per meno di un'ora dopo solo quello dei 5 minuti.
 *
 * Dal 22/09/2026, per calendario:
 *   • WhatsApp insieme alle email, e un ultimo «siamo già collegati» 2-7
 *     minuti prima (whatsapp_numero_id, promemoria_5min; solo piattaforma);
 *   • gli stessi messaggi, più la conferma, anche per gli appuntamenti
 *     inseriti a mano nel CRM (messaggi_crm_dal): chi viene fissato al
 *     telefono riceve quello che riceve chi prenota da solo;
 *   • il link fisso della videochiamata (link_videochiamata) in ogni messaggio.
 *
 * Ogni invio viene timbrato sull'appuntamento, così un secondo giro non lo
 * ripete; spostando l'appuntamento i timbri si azzerano (trigger
 * trg_appuntamento_spostato_riarma_messaggi) e i promemoria ripartono.
 *
 * Risponde subito a pg_net e finisce in background: i WhatsApp simulano la
 * scrittura e ognuno prende qualche secondo (vedi CLAUDE.md, «la coda è una sola»).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { romaVersoUtc, creaIcs, allegatoIcs, urlGestione } from "../_shared/appuntamentiPubblici.ts";
import { emailAppuntamento, momentiDaMandare, whatsappAppuntamento, type DatiMessaggio, type MomentoPromemoria } from "../_shared/messaggiAppuntamento.ts";
import { sendOpenWaMessage, OPENWA_PLATFORM_COMPANY_ID } from "../_shared/openwaSend.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { opzioniMittenteCalendario } from "../_shared/mittenteCalendario.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const APP_ORIGIN = "https://app.ediliziaincloud.com";

const TIMBRO: Record<MomentoPromemoria, string> = {
  conferma: "conferma_inviata_at",
  promemoria_24h: "reminder_24h_at",
  promemoria_1h: "reminder_1h_at",
  promemoria_5min: "reminder_5m_at",
};

serveConMetricheRapida("appuntamenti-promemoria", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!((!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET))) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const esito = { esaminati: 0, conferme: 0, promemoria_24h: 0, promemoria_1h: 0, promemoria_5min: 0, whatsapp: 0, errori: [] as string[] };

  try {
    const adesso = Date.now();
    // I prossimi due giorni (ora italiana): dentro ci stanno tutte le finestre.
    const oggi = new Date(adesso).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    const fra2giorni = new Date(adesso + 2 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

    const { data: righe, error } = await admin
      .from("appointments")
      .select("id, calendar_id, company_id, contact_id, appointment_date, appointment_time, title, booking_email, manage_token, meeting_url, created_at, conferma_inviata_at, reminder_24h_at, reminder_1h_at, reminder_5m_at, status")
      .eq("status", "confermato")
      .not("calendar_id", "is", null)
      .or("booking_email.not.is.null,contact_id.not.is.null")
      .gte("appointment_date", oggi)
      .lte("appointment_date", fra2giorni)
      .limit(300);
    if (error) throw error;

    const calendari = new Map<string, any>();
    for (const a of (righe ?? []) as any[]) {
      esito.esaminati++;
      try {
        const ora = String(a.appointment_time ?? "00:00").slice(0, 5);
        const mancano = romaVersoUtc(a.appointment_date, ora).getTime() - adesso;
        if (mancano <= 0) continue;

        if (!calendari.has(a.calendar_id)) {
          const { data: c } = await admin
            .from("marketing_calendars")
            .select("id, company_id, name, description, duration_minutes, reminder_24h, reminder_1h, link_videochiamata, whatsapp_numero_id, promemoria_5min, messaggi_crm_dal, firma_messaggi, cosa_preparare, mittente_nome, mittente_email")
            .eq("id", a.calendar_id).maybeSingle();
          calendari.set(a.calendar_id, c ?? null);
        }
        const cal = calendari.get(a.calendar_id);
        if (!cal) continue;

        // Chi riceve i messaggi: chi ha prenotato dalla pagina pubblica sempre;
        // gli appuntamenti inseriti a mano solo se il calendario lo prevede, e
        // solo quelli nati dopo che è stato acceso.
        const pubblica = !!a.booking_email;
        // Nato dopo che il calendario ha acceso i messaggi anche per il CRM:
        // accendendoli non partono conferme per gli appuntamenti già in agenda.
        const dopoAccensione = !!cal.messaggi_crm_dal
          && new Date(a.created_at).getTime() >= new Date(cal.messaggi_crm_dal).getTime();
        const daCrm = !pubblica && !!a.contact_id && dopoAccensione;
        if (!pubblica && !daCrm) continue;

        // La conferma della pagina pubblica la manda la prenotazione stessa: qui
        // quella degli appuntamenti inseriti a mano, e di quelli spostati dal
        // CRM o da Google (il trigger ha tolto il timbro), anche se prenotati
        // dal link. «Conferma e promemoria si ricalcolano sulla nuova data».
        const momenti = momentiDaMandare({
          adesso,
          inizio: adesso + mancano,
          creatoIl: new Date(a.created_at).getTime(),
          confermaInviataIl: a.conferma_inviata_at ? new Date(a.conferma_inviata_at).getTime() : null,
          giaMandati: { h24: !!a.reminder_24h_at, h1: !!a.reminder_1h_at, m5: !!a.reminder_5m_at },
          confermaDovuta: daCrm || (pubblica && dopoAccensione),
        });
        if (momenti.length === 0) continue;

        const contatto = a.contact_id
          ? (await admin.from("marketing_contacts").select("first_name, email, phone, optout_email, optout_whatsapp, unsubscribed").eq("id", a.contact_id).maybeSingle()).data
          : null;
        const email = a.booking_email || contatto?.email || null;
        const telefono = contatto?.phone || null;
        const d: DatiMessaggio = {
          nome: contatto?.first_name || String(a.title ?? "").split(" — ")[0].split(" ")[0] || "",
          calendario: cal.name,
          dataIso: a.appointment_date,
          ora,
          durataMin: cal.duration_minutes || 30,
          linkCall: a.meeting_url || cal.link_videochiamata || null,
          linkGestione: a.manage_token ? urlGestione(APP_ORIGIN, a.manage_token) : null,
          firma: cal.firma_messaggi,
          cosaPreparare: cal.cosa_preparare,
        };

        for (const momento of momenti) {
          // Il calendario può spegnere i promemoria email: il timbro evita di riprovarci.
          const emailSpenta = (momento === "promemoria_24h" && cal.reminder_24h === false)
            || (momento === "promemoria_1h" && cal.reminder_1h === false);
          let emailProvata = false, emailFallita = false, whatsappProvato = false;

          if (momento !== "promemoria_5min" && email && !emailSpenta && !contatto?.optout_email) {
            emailProvata = true;
            const m = emailAppuntamento(momento, d);
            const r = await sendEmailUnified({
              companyId: a.company_id,
              stream: "transactional",
              to: email,
              subject: m.oggetto,
              html: m.html,
              text: m.testo,
              templateName: `appuntamento_${momento}`,
              attachments: momento === "conferma" || momento === "promemoria_24h"
                ? [allegatoIcs(creaIcs({
                    uid: `${a.id}@ediliziaincloud.com`, titolo: cal.name, descrizione: cal.description ?? null,
                    dataIso: a.appointment_date, ora, durataMin: d.durataMin, partecipante: email, luogo: d.linkCall,
                  }))]
                : undefined,
              adminClient: admin,
              metadata: { appointment_id: a.id, calendar_id: cal.id },
              ...(await opzioniMittenteCalendario(admin, cal, a.contact_id)),
            });
            if (r && r.ok === false) {
              emailFallita = true;
              esito.errori.push(`${a.id}: email ${momento} non inviata`);
            }
          }

          // WhatsApp solo dalla piattaforma (numeri WhatsApp Locale) e solo a chi non l'ha chiesto di no.
          if (cal.whatsapp_numero_id && telefono && cal.company_id === OPENWA_PLATFORM_COMPANY_ID
              && !contatto?.optout_whatsapp && !contatto?.unsubscribed
              && (momento !== "promemoria_5min" || cal.promemoria_5min)) {
            const testo = whatsappAppuntamento(momento, d);
            if (testo) {
              whatsappProvato = true;
              const w = await sendOpenWaMessage(admin, {
                to: telefono,
                contactId: a.contact_id,
                text: testo,
                numberId: cal.whatsapp_numero_id,
                // Segue l'orario dell'appuntamento, non la fascia degli invii a freddo.
                bypassQuietHours: true,
              });
              if (w.ok) esito.whatsapp++;
              else esito.errori.push(`${a.id}: WhatsApp ${momento} non inviato (${w.error ?? w.status})`);
            }
          }

          // Solo email, e l'email non è partita: niente timbro, il giro dopo
          // riprova (finché si è nella finestra, come prima). Con anche il
          // WhatsApp si timbra comunque: riprovare rimanderebbe il canale riuscito.
          if (emailProvata && emailFallita && !whatsappProvato) continue;
          await admin.from("appointments").update({ [TIMBRO[momento]]: new Date().toISOString() }).eq("id", a.id);
          esito[momento === "conferma" ? "conferme" : momento]++;
        }
      } catch (e) {
        esito.errori.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return json(esito);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), ...esito }, 500);
  }
});
