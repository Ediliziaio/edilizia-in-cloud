// Lead Scraper · tracking pubblico delle email outreach.
//   GET ?e=<outreachId>&t=open          → logga apertura, ritorna GIF 1x1
//   GET ?e=<outreachId>&t=click&u=<url> → logga click, redirect 302 a <url>
// PUBBLICO (verify_jwt=false). Usa service-role per aggiornare il record.
// Non espone dati: scrive soltanto i contatori sul record indicato dall'id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// GIF trasparente 1x1
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

function pixelResponse(): Response {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}

function isSafeHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("e");
  const type = url.searchParams.get("t");
  const target = url.searchParams.get("u");

  // UUID v4-ish guard per evitare scritture su input arbitrario
  const isUuid = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUuid) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      // Incremento ATOMICO in un solo UPDATE (RPC): due pixel/click concorrenti
      // non si perdono più a vicenda (il vecchio select→update era un TOCTOU).
      await admin.rpc("lead_scraper_track_bump", {
        p_id: id,
        p_kind: type === "click" ? "click" : "open",
      });
    } catch {
      // tracking best-effort: non bloccare mai la consegna del pixel/redirect
    }
  }

  if (type === "click" && target && isSafeHttpUrl(target)) {
    return new Response(null, { status: 302, headers: { Location: target } });
  }
  return pixelResponse();
});
