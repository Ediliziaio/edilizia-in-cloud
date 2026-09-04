/**
 * calcola-liquidazione-iva
 *
 * Prima questa funzione non leggeva le fatture: cercava in `prima_nota` i conti
 * il cui *nome somiglia* alla parola IVA, sommava alla cieca dare e avere, e se
 * la query falliva registrava un warning nei log restituendo comunque
 * `{iva_vendite:0, iva_acquisti:0, saldo:0}` — presentato come una liquidazione
 * valida. Su un trimestre con 1.890,00 € realmente a debito rispondeva 0,00 €.
 *
 * Ora il calcolo sta nel database (public.liquidazione_iva_periodo) e legge le
 * stesse fonti del Registro IVA: documenti_fiscali e fatture_ricevute. Qui resta
 * solo il trasporto. Quando il periodo non contiene documenti la funzione lo
 * dichiara con un 422 e un motivo leggibile, invece di rispondere zero.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface LiquidazioneParams {
  company_id: string;
  periodo: "mensile" | "trimestrale";
  anno: number;
  mese?: number;
  trimestre?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    try {
      await requireAuth(req, corsH);
    } catch (authErr) {
      if (authErr instanceof Response) return authErr;
      return errorResponse("Unauthorized", 401, corsH);
    }

    const params = await req.json() as LiquidazioneParams;
    const { company_id, periodo, anno, mese, trimestre } = params;

    if (!company_id || !periodo || !anno) {
      return errorResponse("company_id, periodo e anno sono obbligatori", 400, corsH);
    }

    // Client con il JWT dell'utente, non col service role: così il controllo di
    // accesso resta uno solo, dentro la RPC, e vale per qualunque chiamante.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data, error } = await supabase.rpc("liquidazione_iva_periodo", {
      p_company_id: company_id,
      p_periodo: periodo,
      p_anno: anno,
      p_mese: mese ?? null,
      p_trimestre: trimestre ?? null,
    });

    if (error) {
      // 42501 = accesso negato, 22023 = parametri fuori range.
      const stato = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      return errorResponse(error.message, stato, corsH);
    }

    const r = data as Record<string, unknown>;

    // Il punto dell'intervento: senza dati non si risponde con uno zero che
    // sembra una liquidazione. Chi chiama riceve un rifiuto motivato.
    if (r?.calcolabile === false) {
      // corsH esplicito: senza, secureHeaders fissa l'Origin al dominio .com e
      // il browser scarta la risposta su .it e sui domini white-label — cioè
      // proprio il rifiuto motivato non arriverebbe a chi deve leggerlo.
      return jsonResponse(
        { error: r.motivo, calcolabile: false, dettaglio: r },
        422,
        corsH,
      );
    }

    const saldo = Number(r.saldo ?? 0);

    return jsonResponse({
      // Forma storica, per non rompere chi già la legge.
      iva_vendite: Number(r.iva_vendite ?? 0),
      iva_acquisti: Number(r.iva_acquisti ?? 0),
      saldo: Math.abs(saldo),
      credito: saldo < 0,
      dovuto: saldo > 0,
      periodo_label: (r.periodo as Record<string, unknown>)?.etichetta ?? "",
      // Quello che prima non c'era: il segno vero, da dove escono i numeri, e
      // quali ipotesi sono state fatte per arrivarci.
      calcolabile: true,
      saldo_firmato: saldo,
      imponibile_vendite: Number(r.imponibile_vendite ?? 0),
      imponibile_acquisti: Number(r.imponibile_acquisti ?? 0),
      documenti: r.documenti,
      dettaglio_aliquote: r.dettaglio_aliquote,
      escluso: r.escluso,
      esigibilita_differita: Number(r.esigibilita_differita ?? 0),
      ipotesi: r.ipotesi,
      periodo: r.periodo,
    }, 200, corsH);
  } catch (error: unknown) {
    console.error("calcola-liquidazione-iva error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500, corsH);
  }
});
