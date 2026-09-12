// openwa-riconcilia-stati — riallinea lo stato dei numeri WhatsApp Locale
// chiedendolo al gateway, invece di aspettare che sia lui a dircelo.
//
// PERCHÉ ESISTE. Lo stato dei numeri viveva solo sugli eventi push del
// gateway: un evento perso, o con lo stato in un campo che non leggevamo, e il
// numero restava "scollegato" per sempre. Il 12/09/2026 tutti e quattro i
// numeri risultavano in attesa di QR mentre il gateway li dava `ready`: le
// campagne erano ferme da mezzanotte e nessun avviso era partito, perché
// nessuno stava cadendo davvero.
//
// Una sola chiamata (`GET /api/sessions`) copre tutte le sessioni. Gira ogni
// 10 minuti: qualunque disallineamento si chiude da solo entro un giro.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { conMetriche } from "../_shared/withMetrics.ts";
import { getOwaConfig, owaFetch, OWA_PATHS } from "../_shared/openwaSend.ts";
import { mappaStatoOpenWa, statoGrezzoDaPayload } from "../_shared/openwaStato.ts";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";

function romeToday(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }))
    .toISOString().slice(0, 10);
}

Deno.serve(conMetriche("openwa-riconcilia-stati", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jsonH = { ...cors, "Content-Type": "application/json" };

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret");
  if (!cronSecret || reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonH });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const esito = { numeri: 0, allineati: 0, corretti: [] as string[], sconosciuti: [] as string[], assenti: [] as string[] };

  try {
    const { data: numeri } = await admin
      .from("openwa_numbers")
      .select("id, session_id, numero, display_name, stato, connected_since")
      .is("deleted_at", null);
    esito.numeri = (numeri ?? []).length;
    if (!esito.numeri) return new Response(JSON.stringify({ ok: true, ...esito }), { headers: jsonH });

    const cfg = await getOwaConfig();
    const r = await owaFetch(cfg, OWA_PATHS.createSession(), { method: "GET" }, 15000);
    if (!r.ok || !Array.isArray(r.json)) {
      return new Response(JSON.stringify({ ok: false, error: `gateway: ${r.status} ${r.text}`.slice(0, 300), ...esito }), { status: 502, headers: jsonH });
    }
    const perSessione = new Map<string, Record<string, unknown>>();
    for (const s of r.json as Record<string, unknown>[]) {
      if (typeof s.id === "string") perSessione.set(s.id, s);
    }

    for (const n of numeri ?? []) {
      const sessione = perSessione.get(n.session_id as string);
      if (!sessione) {
        // La sessione non esiste più sul gateway: è una caduta vera.
        esito.assenti.push(n.numero ?? n.session_id);
        if (n.stato === "connected") {
          await admin.from("openwa_numbers")
            .update({ stato: "disconnected", ultimo_errore: "sessione assente sul gateway" })
            .eq("id", n.id);
          esito.corretti.push(`${n.numero}: connected → disconnected`);
        }
        continue;
      }
      const stato = mappaStatoOpenWa(statoGrezzoDaPayload(sessione));
      if (!stato) { esito.sconosciuti.push(`${n.numero}: ${statoGrezzoDaPayload(sessione) || "(vuoto)"}`); continue; }
      if (stato === n.stato) { esito.allineati++; continue; }

      const patch: Record<string, unknown> = { stato, last_seen_at: new Date().toISOString() };
      if (stato === "connected" && !n.connected_since) patch.connected_since = romeToday();
      if (stato === "connected") { patch.errori_consecutivi = 0; patch.ultimo_errore = null; }
      await admin.from("openwa_numbers").update(patch).eq("id", n.id);
      esito.corretti.push(`${n.numero}: ${n.stato} → ${stato}`);

      // Il numero è caduto DAVVERO (lo dice il gateway, non un evento perso):
      // chi presidia deve saperlo, altrimenti le campagne si fermano zitte.
      if ((stato === "disconnected" || stato === "banned") && n.stato === "connected") {
        const { count: altriAttivi } = await admin
          .from("openwa_numbers")
          .select("id", { count: "exact", head: true })
          .eq("stato", "connected").is("deleted_at", null).neq("id", n.id);
        try {
          await avvisaSuperAdmin(admin, {
            tipo: stato === "banned" ? "whatsapp_numero_bannato" : "whatsapp_numero_disconnesso",
            titolo: `${stato === "banned" ? "Numero WhatsApp BANNATO" : "Numero WhatsApp disconnesso"}: ${n.display_name || n.numero}`,
            testo: (altriAttivi ?? 0) > 0
              ? `Gli invii proseguono sugli altri ${altriAttivi} numeri connessi.`
              : "Era l'ultimo numero attivo: campagne e risposte sono FERME finché non ricolleghi un numero.",
            url: "/admin/impostazioni/whatsapp-locale",
            tag: `openwa-stato-${n.id}`,
            entityType: null,
            entityId: null,
          });
        } catch { /* l'avviso non deve far fallire la riconciliazione */ }
      }
    }

    if (esito.corretti.length) console.log("[openwa-riconcilia-stati]", esito.corretti.join(" · "));
    if (esito.sconosciuti.length) console.warn("[openwa-riconcilia-stati] stati non riconosciuti:", esito.sconosciuti.join(" · "));
    return new Response(JSON.stringify({ ok: true, ...esito }), { headers: jsonH });
  } catch (e) {
    console.error("[openwa-riconcilia-stati]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, ...esito }), { status: 500, headers: jsonH });
  }
}));
