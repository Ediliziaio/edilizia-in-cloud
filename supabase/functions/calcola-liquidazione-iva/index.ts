/**
 * calcola-liquidazione-iva
 * Calcola IVA a debito e credito per il periodo richiesto.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

interface LiquidazioneParams {
  company_id: string;
  periodo: "mensile" | "trimestrale";
  anno: number;
  mese?: number;        // 1-12, for mensile
  trimestre?: number;   // 1-4, for trimestrale
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // Auth: valida il JWT utente (prima si controllava solo la presenza header).
    let userId: string;
    try {
      const auth = await requireAuth(req, corsH);
      userId = auth.userId;
    } catch (authErr) {
      if (authErr instanceof Response) return authErr;
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const params = await req.json() as LiquidazioneParams;
    const { company_id, periodo, anno, mese, trimestre } = params;

    if (!company_id || !periodo || !anno) {
      return errorResponse("company_id, periodo e anno sono obbligatori", 400);
    }

    // Tenant check: l'utente deve appartenere alla company richiesta. Prima si
    // leggevano i dati IVA di QUALSIASI azienda passando il company_id nel body.
    try {
      await requireCompanyAccess(supabase, userId, company_id, corsH);
    } catch (accessErr) {
      if (accessErr instanceof Response) return accessErr;
      return errorResponse("Forbidden", 403);
    }

    // Calcola date inizio/fine del periodo
    let dataInizio: string;
    let dataFine: string;
    let periodoLabel: string;

    if (periodo === "mensile") {
      if (!mese || mese < 1 || mese > 12) return errorResponse("mese non valido", 400);
      const meseStr = mese.toString().padStart(2, "0");
      const giorniFine = new Date(anno, mese, 0).getDate();
      dataInizio = `${anno}-${meseStr}-01`;
      dataFine = `${anno}-${meseStr}-${giorniFine}`;
      const nomiMesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
      periodoLabel = `${nomiMesi[mese - 1]} ${anno}`;
    } else {
      if (!trimestre || trimestre < 1 || trimestre > 4) return errorResponse("trimestre non valido", 400);
      const meseInizio = (trimestre - 1) * 3 + 1;
      const meseFine = trimestre * 3;
      const meseIStr = meseInizio.toString().padStart(2, "0");
      const meseFStr = meseFine.toString().padStart(2, "0");
      const giorniFine = new Date(anno, meseFine, 0).getDate();
      dataInizio = `${anno}-${meseIStr}-01`;
      dataFine = `${anno}-${meseFStr}-${giorniFine}`;
      periodoLabel = `${trimestre}° Trimestre ${anno}`;
    }

    // Cerca nella tabella prima_nota voci IVA (conto inizia con "IVA" o "2610" ecc.)
    // IVA a debito: importo_dare > 0 su conti IVA vendite
    // IVA a credito: importo_avere > 0 su conti IVA acquisti
    // Usiamo una query semplificata che somma dare/avere sui conti IVA
    const { data: righeIVA, error: ivaErr } = await supabase
      .from("prima_nota")
      .select("conto, importo_dare, importo_avere, data")
      .eq("company_id", company_id)
      .gte("data", dataInizio)
      .lte("data", dataFine)
      .or("conto.ilike.%IVA%,conto.ilike.%2610%,conto.ilike.%2620%,conto.ilike.%2630%");

    if (ivaErr) {
      // Se la tabella non esiste, ritorna dati zero
      console.warn("prima_nota query error:", ivaErr.message);
    }

    const righe = righeIVA ?? [];
    const ivaVendite = righe.reduce((s, r) => s + Number(r.importo_dare ?? 0), 0);
    const ivaAcquisti = righe.reduce((s, r) => s + Number(r.importo_avere ?? 0), 0);
    const saldo = ivaVendite - ivaAcquisti;

    return jsonResponse({
      iva_vendite: ivaVendite,
      iva_acquisti: ivaAcquisti,
      saldo: Math.abs(saldo),
      credito: saldo < 0,
      dovuto: saldo > 0,
      periodo_label: periodoLabel,
    });
  } catch (error: unknown) {
    console.error("calcola-liquidazione-iva error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
