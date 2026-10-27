/**
 * Chi ha il canale WhatsApp fermo adesso (27/10/2026).
 *
 * Il gancio sugli esiti di consegna (whatsapp-webhook) avvisa quando arriva un messaggio respinto. Ma un canale può
 * essere già fermo da settimane: Il Bagno Group è rimasto 26 giorni senza che nessuno lo sapesse, e l'avviso sarebbe
 * arrivato solo al tentativo successivo. Questo giro guarda indietro: se un'azienda ha messaggi respinti per un
 * guasto del CANALE (pagamento, account bloccato, numero non registrato, limite per spam) e non è stata avvisata
 * nelle ultime 24 ore, la avvisa — azienda e noi.
 *
 * Lo chiama un cron ogni ora, oppure si invoca a mano per una sola azienda (`{"company_id": "..."}`) quando si vuole
 * avvisare subito. La guardia delle 24 ore sta nel database, quindi due giri in parallelo non mandano due email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { segnalaCanaleWhatsAppFermo } from "../_shared/allarmeWhatsApp.ts";
import { canaleFermo, codiceDalMotivoSalvato } from "../_shared/whatsappCanaleFermo.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Quante ore indietro guardare i messaggi respinti. */
const ORE_INDIETRO = 72;

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

  // Una sola segnalazione per azienda: il primo messaggio buono basta a dire qual è il guasto.
  const perAzienda = new Map<string, { codice: number; numero: string | null }>();
  for (const m of respinti ?? []) {
    const riga = m as { company_id: string | null; from_phone: string | null; delivery_error: string | null };
    if (!riga.company_id || perAzienda.has(riga.company_id)) continue;
    const codice = codiceDalMotivoSalvato(riga.delivery_error);
    if (canaleFermo(codice)) perAzienda.set(riga.company_id, { codice: codice!, numero: riga.from_phone });
  }

  const avvisate: string[] = [];
  for (const [companyId, g] of perAzienda) {
    await segnalaCanaleWhatsAppFermo(admin, { companyId, codice: g.codice, numero: g.numero });
    avvisate.push(companyId);
  }
  return jsonResponse({ ok: true, guardate_ore: ore, canali_fermi: perAzienda.size, avvisate });
});
