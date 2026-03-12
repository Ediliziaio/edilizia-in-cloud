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

    const { documento_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id richiesto" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load document
    const { data: doc, error: fetchErr } = await supabase
      .from("documenti_fiscali")
      .select("id, numero, tipo, company_id")
      .eq("id", documento_id)
      .single();

    if (fetchErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (doc.tipo !== "preventivo") {
      return new Response(JSON.stringify({ error: "Solo i preventivi possono generare link di accettazione" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create a simple token (base64 encoded JSON with expiry)
    const payload = {
      doc_id: documento_id,
      company_id: doc.company_id,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    const token = btoa(JSON.stringify(payload));

    // Build public URL
    const publicUrl = `${req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app")}/preventivo/${documento_id}?token=${token}`;

    return new Response(JSON.stringify({ url: publicUrl, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
