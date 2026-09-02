/**
 * sms-rinnovo-numeri — il canone mensile dei numeri, addebitato davvero.
 *
 * IL GUASTO CHE QUESTA FUNZIONE ESISTE PER CHIUDERE
 * -------------------------------------------------
 * All'acquisto di un numero si scriveva `prossimo_rinnovo` (fra un mese) e
 * `costo_mensile_cliente`, e poi nessuno li guardava piu': il numero restava
 * attivo per sempre, Telnyx ce lo fatturava ogni mese, e al cliente non veniva
 * scalato nulla. Un ricavo ricorrente che non esisteva, e un costo ricorrente
 * che si.
 *
 * Cosa fa: per ogni numero attivo con rinnovo scaduto, addebita il canone sul
 * wallet SMS (RPC atomica, con transazione registrata) e sposta la scadenza di
 * un mese. Se il credito non basta NON stacca il numero — sospendere una linea
 * telefonica per 30 euro e' una decisione commerciale, non tecnica: il numero
 * viene marcato `sospeso_pagamento` e il superadmin lo vede.
 *
 * Idempotente: la finestra e' `prossimo_rinnovo <= adesso`, e lo spostamento
 * avviene nello stesso giro dell'addebito. Un secondo giro nello stesso giorno
 * non trova piu' nulla da fare.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

const MAX_PER_RUN = 200;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!cronSecretValido(req) && authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const esito = { scaduti: 0, rinnovati: 0, sospesi: 0, incassato_eur: 0, errori: 0 };

  const { data: numeri, error } = await admin
    .from("sms_telnyx_numbers")
    .select("id, company_id, numero_e164, costo_mensile_cliente, prossimo_rinnovo")
    .eq("stato", "attivo")
    .lte("prossimo_rinnovo", new Date().toISOString())
    .limit(MAX_PER_RUN);

  if (error) return json({ error: error.message }, 500);
  esito.scaduti = numeri?.length ?? 0;
  if (!numeri?.length) return json({ ok: true, ...esito });

  // Il canone corrente lo decide il superadmin: quello salvato sul numero e'
  // solo il valore al momento dell'acquisto.
  const { data: prezzi } = await admin
    .from("sms_pricing_config").select("prezzo_numero_mensile").eq("attivo", true).limit(1).maybeSingle();
  const canoneCorrente = Number(prezzi?.prezzo_numero_mensile ?? 0);

  for (const n of numeri) {
    const importo = canoneCorrente > 0 ? canoneCorrente : Number(n.costo_mensile_cliente ?? 0);
    if (importo <= 0) { esito.errori++; continue; }

    const { data: res, error: rpcErr } = await admin.rpc("addebita_sms_wallet", {
      p_company_id: n.company_id,
      p_importo: importo,
      p_tipo: "canone_numero",
      p_descrizione: `Canone mensile numero ${n.numero_e164}`,
      p_riferimento_id: n.id,
    });
    const r = (Array.isArray(res) ? res[0] : res) as { ok?: boolean; motivo?: string } | null;

    if (rpcErr) { console.error(`[RINNOVO] ${n.numero_e164}:`, rpcErr.message); esito.errori++; continue; }

    if (!r?.ok) {
      // Credito insufficiente: si segnala, non si stacca.
      await admin.from("sms_telnyx_numbers").update({ stato: "sospeso_pagamento" }).eq("id", n.id);
      esito.sospesi++;
      console.warn(`[RINNOVO] ${n.numero_e164} sospeso: ${r?.motivo ?? "credito insufficiente"}`);
      continue;
    }

    const prossimo = new Date(n.prossimo_rinnovo as string);
    prossimo.setMonth(prossimo.getMonth() + 1);
    // Se il numero era scaduto da piu' di un mese (funzione mai girata), si
    // riparte da oggi: non si recuperano i mesi passati a posteriori.
    if (prossimo.getTime() < Date.now()) prossimo.setTime(Date.now() + 30 * 24 * 3600 * 1000);

    await admin.from("sms_telnyx_numbers")
      .update({ prossimo_rinnovo: prossimo.toISOString() })
      .eq("id", n.id);

    esito.rinnovati++;
    esito.incassato_eur = Number((esito.incassato_eur + importo).toFixed(2));
  }

  return json({ ok: true, ...esito });
});
