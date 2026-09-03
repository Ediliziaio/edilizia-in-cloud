/**
 * appuntamenti-promemoria — promemoria automatici degli appuntamenti presi
 * dalla pagina pubblica (cron ogni 15 minuti).
 *
 * Manda due email a chi ha prenotato: una il giorno prima (finestra 24-25 ore
 * prima) e una un'ora prima (finestra 60-75 minuti). Ogni invio viene
 * timbrato sull'appuntamento, cosi' un secondo giro non lo ripete.
 * Senza promemoria chi prenota con dieci giorni di anticipo semplicemente si
 * dimentica, e lo slot resta bruciato.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import {
  dataEstesa, esc, romaVersoUtc, creaIcs, allegatoIcs,
  urlGestione, blocchettoDettagli, bottoneGestione,
} from "../_shared/appuntamentiPubblici.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const APP_ORIGIN = "https://app.ediliziaincloud.com";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!((!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET))) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const esito = { esaminati: 0, inviati_24h: 0, inviati_1h: 0, errori: [] as string[] };

  try {
    const adesso = Date.now();
    // Si guardano i prossimi due giorni: dentro ci stanno entrambe le finestre.
    const oggi = new Date(adesso).toISOString().slice(0, 10);
    const fra2giorni = new Date(adesso + 2 * 86_400_000).toISOString().slice(0, 10);

    const { data: righe, error } = await admin
      .from("appointments")
      .select("id, calendar_id, company_id, appointment_date, appointment_time, title, booking_email, manage_token, reminder_24h_at, reminder_1h_at, status")
      .eq("status", "confermato")
      .not("calendar_id", "is", null)
      .not("booking_email", "is", null)
      .gte("appointment_date", oggi)
      .lte("appointment_date", fra2giorni)
      .limit(200);
    if (error) throw error;

    const calendari = new Map<string, any>();
    for (const a of (righe ?? []) as any[]) {
      esito.esaminati++;
      try {
        const ora = String(a.appointment_time ?? "00:00").slice(0, 5);
        const inizioMs = romaVersoUtc(a.appointment_date, ora).getTime();
        const mancano = inizioMs - adesso;
        if (mancano <= 0) continue;

        // Finestre generose quanto il giro del cron (15 minuti), con margine.
        const tocca24h = !a.reminder_24h_at && mancano <= 25 * 3_600_000 && mancano > 23 * 3_600_000;
        const tocca1h = !a.reminder_1h_at && mancano <= 75 * 60_000 && mancano > 45 * 60_000;
        if (!tocca24h && !tocca1h) continue;

        if (!calendari.has(a.calendar_id)) {
          const { data: c } = await admin
            .from("marketing_calendars")
            .select("id, name, description, duration_minutes, reminder_24h, reminder_1h, booking_slug")
            .eq("id", a.calendar_id).maybeSingle();
          calendari.set(a.calendar_id, c ?? null);
        }
        const cal = calendari.get(a.calendar_id);
        if (!cal) continue;
        if (tocca24h && cal.reminder_24h === false) { await timbra(admin, a.id, "reminder_24h_at"); continue; }
        if (tocca1h && cal.reminder_1h === false) { await timbra(admin, a.id, "reminder_1h_at"); continue; }

        const durata = cal.duration_minutes || 30;
        const quando = `${dataEstesa(a.appointment_date)} alle ${ora}`;
        const link = a.manage_token ? urlGestione(APP_ORIGIN, a.manage_token) : "";
        const domani = tocca24h;
        const apertura = domani
          ? `ti ricordo l'appuntamento di <strong>domani</strong>.`
          : `ci vediamo fra circa un'ora.`;

        const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a">
            <p>Ciao,</p>
            <p>${apertura}</p>
            ${blocchettoDettagli(quando, durata, cal.name)}
            ${link ? bottoneGestione(link, domani ? "Sposta o disdici" : "Non riesco a esserci") : ""}
          </div>`;
        const testo = `Ciao,\n\n${domani ? "ti ricordo l'appuntamento di domani." : "ci vediamo fra circa un'ora."}\n\nQuando: ${quando}\nDurata: ${durata} minuti\nArgomento: ${cal.name}${link ? `\n\nPer spostarlo o disdirlo: ${link}` : ""}`;

        const allegati = domani
          ? [allegatoIcs(creaIcs({
              uid: `${a.id}@ediliziaincloud.com`, titolo: cal.name, descrizione: cal.description ?? null,
              dataIso: a.appointment_date, ora, durataMin: durata, partecipante: a.booking_email,
            }))]
          : undefined;

        const r = await sendEmailUnified({
          companyId: a.company_id,
          stream: "transactional",
          to: a.booking_email,
          subject: domani ? `Promemoria: appuntamento domani alle ${ora}` : `Fra un'ora: ${cal.name}`,
          html, text: testo,
          templateName: domani ? "appuntamento_promemoria_24h" : "appuntamento_promemoria_1h",
          attachments: allegati,
          adminClient: admin,
          metadata: { appointment_id: a.id, calendar_id: cal.id },
        });
        if (r && r.ok === false) {
          esito.errori.push(`${a.id}: invio non riuscito`);
          continue;
        }
        await timbra(admin, a.id, domani ? "reminder_24h_at" : "reminder_1h_at");
        if (domani) esito.inviati_24h++; else esito.inviati_1h++;
      } catch (e) {
        esito.errori.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return json(esito);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), ...esito }, 500);
  }
});

async function timbra(admin: any, id: string, colonna: string): Promise<void> {
  await admin.from("appointments").update({ [colonna]: new Date().toISOString() }).eq("id", id);
}
