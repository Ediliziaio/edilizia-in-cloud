/**
 * telnyx-invia-sms
 * Invia una campagna SMS via Telnyx SubAccount.
 * Verifica crediti → riserva → invia batch → scala → log.
 * POST autenticato JWT: { campagna_id, company_id }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

interface RequestBody { campagna_id: string; company_id: string }

interface SmsLogInsert {
  campagna_id: string;
  company_id: string;
  contatto_id: string | null;
  telefono: string;
  messaggio: string;
  stato: string;
  telnyx_message_id: string | null;
  costo_cliente: number;
  costo_wholesale: number;
  inviato_at: string | null;
}

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const masterApiKey   = Deno.env.get("TELNYX_MASTER_API_KEY");
    const profileId      = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticazione richiesta" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { campagna_id, company_id } = await req.json() as RequestBody;
    if (!campagna_id || !company_id) return json({ error: "Parametri mancanti" }, 400);

    // SEC (P0): l'utente deve appartenere alla company richiesta (no cross-tenant)
    try {
      const { userId } = await requireAuth(req, corsHeaders);
      await requireCompanyAccess(adminClient, userId, company_id, corsHeaders);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    // Leggi campagna
    const { data: campagna, error: campErr } = await adminClient
      .from("sms_campaigns")
      .select("id, nome, messaggio, stato, filtro_tags, company_id")
      .eq("id", campagna_id)
      .eq("company_id", company_id)
      .single();
    if (campErr || !campagna) return json({ error: "Campagna non trovata" }, 404);
    if (campagna.stato !== "bozza" && campagna.stato !== "pianificata") {
      return json({ error: "La campagna non può essere avviata in questo stato" }, 400);
    }

    // Leggi pricing
    const { data: pricing } = await adminClient
      .from("sms_pricing_config")
      .select("prezzo_per_sms, costo_wholesale_sms")
      .limit(1)
      .maybeSingle();
    const prezzoPerSms   = Number(pricing?.prezzo_per_sms   ?? 0.06);
    const costoWholesale = Number(pricing?.costo_wholesale_sms ?? 0.008);

    // Leggi numero mittente. 2026-06-11: il numero dedicato NON è più un
    // requisito — senza numero si invia con MITTENTE ALFANUMERICO (nome
    // azienda, max 11 caratteri, standard per SMS in Italia). Il numero
    // dedicato resta l'upgrade per ricevere risposte (bidirezionale).
    const { data: numero } = await adminClient
      .from("sms_telnyx_numbers")
      .select("numero_e164, telnyx_phone_number_id")
      .eq("company_id", company_id)
      .eq("stato", "attivo")
      .maybeSingle();

    let mittente: string;
    if (numero) {
      mittente = numero.numero_e164;
    } else {
      const { data: comp } = await adminClient
        .from("companies")
        .select("name, business_name")
        .eq("id", company_id)
        .maybeSingle();
      const rawName = (comp?.business_name || comp?.name || "EdiliziaEiC").trim();
      // Solo lettere/numeri, max 11 char (spec mittente alfanumerico GSM)
      mittente = rawName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "EdiliziaEiC";
    }

    // Leggi destinatari
    let contactQuery = adminClient
      .from("sms_contacts")
      .select("id, telefono, nome, cognome")
      .eq("company_id", company_id)
      .eq("opt_out", false)
      .eq("consenso_marketing", true);

    const filtroTags: string[] = campagna.filtro_tags ?? [];
    if (filtroTags.length > 0) {
      contactQuery = contactQuery.overlaps("tags", filtroTags);
    }

    const { data: contatti, error: contErr } = await contactQuery;
    if (contErr) throw contErr;

    const destinatari = contatti ?? [];
    if (destinatari.length === 0) {
      return json({ error: "Nessun contatto con consenso marketing trovato" }, 400);
    }

    // Calcola costo totale stimato
    const costoTotaleStimato = destinatari.length * prezzoPerSms;

    // Verifica crediti wallet
    const { data: wallet } = await adminClient
      .from("sms_wallet")
      .select("crediti, crediti_riservati")
      .eq("company_id", company_id)
      .maybeSingle();
    const creditiDisponibili = (Number(wallet?.crediti ?? 0)) - (Number(wallet?.crediti_riservati ?? 0));
    const costoConBuffer = costoTotaleStimato * 1.1;

    if (creditiDisponibili < costoConBuffer) {
      return json({
        error: `Crediti insufficienti. Necessari: €${costoConBuffer.toFixed(2)}, Disponibili: €${creditiDisponibili.toFixed(2)}. Ricarica il wallet per inviare.`,
      }, 400);
    }

    // Riserva crediti
    await adminClient
      .from("sms_wallet")
      .update({ crediti_riservati: (Number(wallet?.crediti_riservati ?? 0)) + costoTotaleStimato })
      .eq("company_id", company_id);

    // Aggiorna campagna a in_corso
    await adminClient
      .from("sms_campaigns")
      .update({
        stato: "in_corso",
        totale_destinatari: destinatari.length,
        costo_per_sms_snapshot: prezzoPerSms,
      })
      .eq("id", campagna_id);

    let inviati = 0;
    let errori  = 0;
    let costoTotaleCliente  = 0;
    let costoTotaleWholesale = 0;

    // Invia in batch
    for (let i = 0; i < destinatari.length; i += BATCH_SIZE) {
      const batch = destinatari.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (contatto) => {
          let telnyxMessageId: string | null = null;
          let statoLog = "inviato";

          // Invia via Telnyx se API key disponibile
          if (masterApiKey) {
            try {
              const res = await fetch("https://api.telnyx.com/v2/messages", {
                method: "POST",
                headers: { "Authorization": `Bearer ${masterApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: mittente,
                  to: contatto.telefono,
                  text: campagna.messaggio,
                  // Obbligatorio per mittente alfanumerico (profilo piattaforma)
                  ...(profileId ? { messaging_profile_id: profileId } : {}),
                }),
              });
              if (res.ok) {
                const body = await res.json() as { data: { id: string } };
                telnyxMessageId = body.data.id;
                inviati++;
                costoTotaleCliente   += prezzoPerSms;
                costoTotaleWholesale += costoWholesale;
              } else {
                statoLog = "fallito";
                errori++;
              }
            } catch {
              statoLog = "fallito";
              errori++;
            }
          } else {
            // Modalità sviluppo: simula invio
            telnyxMessageId = `mock_${Date.now()}_${contatto.id.slice(0,8)}`;
            inviati++;
            costoTotaleCliente   += prezzoPerSms;
            costoTotaleWholesale += costoWholesale;
          }

          const logRecord: SmsLogInsert = {
            campagna_id,
            company_id,
            contatto_id: contatto.id,
            telefono: contatto.telefono,
            messaggio: campagna.messaggio,
            stato: statoLog,
            telnyx_message_id: telnyxMessageId,
            costo_cliente: prezzoPerSms,
            costo_wholesale: costoWholesale,
            inviato_at: statoLog === "inviato" ? new Date().toISOString() : null,
          };
          await adminClient.from("sms_log").insert(logRecord);
        })
      );
      if (i + BATCH_SIZE < destinatari.length) await sleep(BATCH_DELAY_MS);
    }

    // Aggiorna wallet: libera riservato, scala reale
    await adminClient.rpc("update_sms_wallet_dopo_invio", {
      p_company_id: company_id,
      p_costo_reale: costoTotaleCliente,
      p_riservato_da_liberare: costoTotaleStimato,
    }).then(async () => {
      // Se RPC non esiste, aggiorna direttamente
    }).catch(async () => {
      await adminClient
        .from("sms_wallet")
        .update({
          crediti: (Number(wallet?.crediti ?? 0)) - costoTotaleCliente,
          crediti_riservati: Math.max(0, (Number(wallet?.crediti_riservati ?? 0)) - costoTotaleStimato),
        })
        .eq("company_id", company_id);
    });

    // Registra transazione wallet
    const saldoDopo = (Number(wallet?.crediti ?? 0)) - costoTotaleCliente;
    await adminClient.from("sms_wallet_transazioni").insert({
      company_id,
      tipo: "addebito_sms",
      importo: -costoTotaleCliente,
      saldo_dopo: saldoDopo,
      descrizione: `Invio campagna "${campagna.nome}" — ${inviati} SMS`,
      riferimento_id: campagna_id,
    });

    // Finalizza campagna
    await adminClient
      .from("sms_campaigns")
      .update({
        stato: "completata",
        inviati,
        errori,
        consegnati: 0, // aggiornato dal webhook delivery receipt
        costo_totale: costoTotaleCliente,
        costo_totale_cliente: costoTotaleCliente,
        costo_totale_wholesale: costoTotaleWholesale,
      })
      .eq("id", campagna_id);

    const creditiResidui = saldoDopo;
    return json({ success: true, inviati, errori, costo_totale: costoTotaleCliente, crediti_residui: creditiResidui });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
