import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

/** Verifica firma HMAC-SHA256 del token preventivo (SEC-014) */
async function verifyToken(payloadB64: string, sigHex: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Confronto timing-safe
  if (computed.length !== sigHex.length) return false;
  const a = new TextEncoder().encode(computed);
  const b = new TextEncoder().encode(sigHex);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { documento_id, token, action } = await req.json();

    if (!documento_id || !token || !action) {
      return new Response(JSON.stringify({ error: "Parametri mancanti" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!["accetta", "rifiuta"].includes(action)) {
      return new Response(JSON.stringify({ error: "Azione non valida" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Solo token firmati (SEC-014), e solo con il segreto configurato. Prima, se
    // mancava, si verificava con «default-change-me», scritto qui nel repository,
    // e si accettavano token base64 non firmati: chiunque conoscesse l'id poteva
    // accettare o annullare il preventivo.
    const secret = Deno.env.get("PREVENTIVO_TOKEN_SECRET");
    if (!secret) {
      console.error("accetta-preventivo: PREVENTIVO_TOKEN_SECRET non configurato");
      return new Response(JSON.stringify({ error: "Link di accettazione non disponibile" }), {
        status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    let payload: { doc_id: string; company_id: string; exp: number };
    try {
      const dotIndex = token.indexOf(".");
      if (dotIndex === -1) {
        return new Response(JSON.stringify({ error: "Token non valido" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const payloadB64 = token.slice(0, dotIndex);
      const sigHex = token.slice(dotIndex + 1);
      const valid = await verifyToken(payloadB64, sigHex, secret);
      if (!valid) {
        console.error("accetta-preventivo: firma token non valida");
        return new Response(JSON.stringify({ error: "Token non valido" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      payload = JSON.parse(atob(payloadB64));
    } catch {
      return new Response(JSON.stringify({ error: "Token non valido" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (payload.doc_id !== documento_id) {
      return new Response(JSON.stringify({ error: "Token non corrisponde al documento" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (Date.now() > payload.exp) {
      return new Response(JSON.stringify({ error: "Link scaduto" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Aggiorna documento
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
      return new Response(JSON.stringify({ error: "Errore nell'aggiornamento" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Log
    await supabase.from("sdi_log").insert({
      company_id: payload.company_id,
      documento_id,
      evento: `preventivo_${action === "accetta" ? "accettato" : "rifiutato"}`,
      dettagli: { action, via: "link_pubblico" },
    });

    return new Response(JSON.stringify({ success: true, stato: newStato }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
