import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { documento_id, token, action } = await req.json();

    if (!documento_id || !token || !action) {
      return new Response(JSON.stringify({ error: "Parametri mancanti" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!["accetta", "rifiuta"].includes(action)) {
      return new Response(JSON.stringify({ error: "Azione non valida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate token
    let payload: { doc_id: string; company_id: string; exp: number };
    try {
      payload = JSON.parse(atob(token));
    } catch {
      return new Response(JSON.stringify({ error: "Token non valido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payload.doc_id !== documento_id) {
      return new Response(JSON.stringify({ error: "Token non corrisponde al documento" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (Date.now() > payload.exp) {
      return new Response(JSON.stringify({ error: "Link scaduto" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update document
    const newStato = action === "accetta" ? "accettata" : "annullata";
    const { error: updateErr } = await supabase
      .from("documenti_fiscali")
      .update({
        stato: newStato,
        note_interne: `Preventivo ${action === "accetta" ? "accettato" : "rifiutato"} dal cliente via link`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documento_id)
      .eq("tipo", "preventivo");

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Errore nell'aggiornamento" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log to sdi_log
    await supabase.from("sdi_log").insert({
      company_id: payload.company_id,
      documento_id,
      evento: `preventivo_${action === "accetta" ? "accettato" : "rifiutato"}`,
      dettagli: { action, via: "link_pubblico" },
    });

    return new Response(JSON.stringify({ success: true, stato: newStato }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
