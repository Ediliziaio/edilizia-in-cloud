/**
 * Chi ha il canale WhatsApp fermo adesso (27/10/2026).
 *
 * Il gancio sugli esiti di consegna (whatsapp-webhook) avvisa quando arriva un messaggio respinto. Ma un canale può
 * essere già fermo da settimane: Il Bagno Group è rimasto 26 giorni senza che nessuno lo sapesse, e l'avviso sarebbe
 * arrivato solo al tentativo successivo. Questo giro guarda indietro: se un'azienda ha messaggi respinti per un
 * guasto del CANALE (pagamento, account bloccato, numero non registrato, limite per spam) e non è stata avvisata
 * nelle ultime 24 ore, la avvisa — azienda e noi.
 *
 * Un messaggio consegnato DOPO l'ultimo guasto vuol dire che il canale è ripartito, e non si avvisa (02/11/2026). Il
 * Bagno Group ha sistemato il pagamento il 30/10: per i tre giorni dopo, con i messaggi che arrivavano, ha continuato
 * a ricevere «non parte più nessun messaggio» perché il guasto vecchio restava dentro le 72 ore.
 *
 * Pubblicata con verify_jwt = false (vedi supabase/config.toml): chi la chiama porta x-cron-secret, non un JWT.
 * Lo chiama un cron ogni ora, oppure si invoca a mano per una sola azienda (`{"company_id": "..."}`) quando si vuole
 * avvisare subito. La guardia delle 24 ore sta nel database, quindi due giri in parallelo non mandano due email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { segnalaCanaleWhatsAppFermo } from "../_shared/allarmeWhatsApp.ts";
import { ultimiGuasti, type GuastoCanale, type MessaggioRespinto } from "../_shared/whatsappCanaleFermo.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Quante ore indietro guardare i messaggi respinti. */
const ORE_INDIETRO = 72;

/** Dopo il guasto è stato consegnato qualcosa da quel numero? Nel dubbio no: meglio un avviso in più che uno in meno. */
async function ripartito(g: GuastoCanale): Promise<boolean> {
  let q = admin.from("whatsapp_messages")
    .select("id")
    .eq("company_id", g.companyId)
    .eq("direction", "outbound")
    .in("delivery_status", ["delivered", "read"])
    .gt("created_at", g.il)
    .limit(1);
  if (g.numero) q = q.eq("from_phone", g.numero);
  const { data, error } = await q;
  if (error) {
    console.error("[whatsapp-canale-controllo] lettura consegne:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (!cronSecretValido(req)) return errorResponse("Non autorizzato", 401, corsH);

  const corpo = await req.json().catch(() => ({})) as { company_id?: string; ore?: number };
  const ore = Number.isFinite(Number(corpo.ore)) ? Math.min(336, Math.max(1, Number(corpo.ore))) : ORE_INDIETRO;
  const da = new Date(Date.now() - ore * 3_600_000).toISOString();

  let q = admin.from("whatsapp_messages")
    .select("company_id, from_phone, delivery_error, created_at")
    .eq("direction", "outbound").eq("delivery_status", "failed")
    .not("delivery_error", "is", null)
    .gte("created_at", da)
    .order("created_at", { ascending: false })
    .limit(500);
  if (corpo.company_id) q = q.eq("company_id", corpo.company_id);
  const { data: respinti, error } = await q;
  if (error) return errorResponse(`Lettura messaggi: ${error.message}`, 500, corsH);

  // Una sola segnalazione per azienda: il primo numero ancora fermo basta a dire qual è il guasto.
  const perAzienda = new Map<string, GuastoCanale>();
  const ripartiti: string[] = [];
  for (const g of ultimiGuasti((respinti ?? []) as MessaggioRespinto[])) {
    if (perAzienda.has(g.companyId)) continue;
    if (await ripartito(g)) ripartiti.push(g.companyId);
    else perAzienda.set(g.companyId, g);
  }

  const avvisate: string[] = [];
  for (const [companyId, g] of perAzienda) {
    await segnalaCanaleWhatsAppFermo(admin, { companyId, codice: g.codice, numero: g.numero });
    avvisate.push(companyId);
  }
  return jsonResponse({ ok: true, guardate_ore: ore, canali_fermi: perAzienda.size, avvisate, ripartiti });
});
// 07/11/2026: ripubblicata perché le email di servizio partono col solo nome dell'azienda, senza «via EdiliziaInCloud» (_shared/resolveSender.ts).
