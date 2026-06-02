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
      // Legge lo stato corrente per incrementare i contatori e impostare i timestamp.
      const { data: row } = await admin
        .from("lead_scraper_outreach")
        .select("id, status, open_count, click_count, opened_at, clicked_at")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        const now = new Date().toISOString();
        if (type === "click") {
          await admin.from("lead_scraper_outreach").update({
            click_count: (row.click_count ?? 0) + 1,
            clicked_at: row.clicked_at ?? now,
            // apertura implicita nel click
            opened_at: row.opened_at ?? now,
            status: row.status === "replied" ? row.status : "clicked",
          }).eq("id", id);
        } else {
          await admin.from("lead_scraper_outreach").update({
            open_count: (row.open_count ?? 0) + 1,
            opened_at: row.opened_at ?? now,
            status: (row.status === "sent") ? "opened" : row.status,
          }).eq("id", id);
        }
      }
    } catch {
      // tracking best-effort: non bloccare mai la consegna del pixel/redirect
    }
  }

  if (type === "click" && target && isSafeHttpUrl(target)) {
    return new Response(null, { status: 302, headers: { Location: target } });
  }
  return pixelResponse();
});
