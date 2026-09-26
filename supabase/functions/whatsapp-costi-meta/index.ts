// whatsapp-costi-meta — quanto ha addebitato Meta per i WhatsApp dell'azienda
// (26/09/2026).
//
// Il numero WhatsApp di un'azienda è sul SUO account Meta: Meta addebita la
// sua carta, non passa da noi. Fino a oggi nessuno lo leggeva, e alla domanda
// «quanto ha pagato Il Bagno a Meta?» non c'era risposta. Qui si chiede a Meta
// (pricing_analytics dell'account WhatsApp Business) messaggio per categoria:
// quanti, quanti gratuiti, quanto addebitato e in che valuta.
//
// Sola lettura. La chiama un utente dell'azienda (JWT) o una nostra funzione /
// il cron (chiamata interna). Corpo: { company_id, dal?: "YYYY-MM-DD", al?: "YYYY-MM-DD" }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";

const VERSIONE = Deno.env.get("META_PRICING_API_VERSION") || "v23.0";
const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

interface Punto {
  volume?: number;
  cost?: number;
  pricing_type?: string;
  pricing_category?: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);

  try {
    const body = await req.json().catch(() => ({})) as { company_id?: string; dal?: string; al?: string };
    const companyId = String(body.company_id ?? "");
    if (!companyId) return errorResponse("company_id obbligatorio", 400, cors);

    // deno-lint-ignore no-explicit-any
    let admin: any;
    if (chiamataInternaValida(req)) {
      admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    } else {
      const { userId, supabaseAdmin } = await requireAuth(req, cors);
      await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);
      admin = supabaseAdmin;
    }

    const oggi = new Date().toISOString().slice(0, 10);
    const dal = GIORNO.test(String(body.dal ?? "")) ? String(body.dal) : `${oggi.slice(0, 7)}-01`;
    const al = GIORNO.test(String(body.al ?? "")) ? String(body.al) : oggi;
    const inizio = Math.floor(Date.parse(`${dal}T00:00:00Z`) / 1000);
    const fine = Math.floor(Date.parse(`${al}T23:59:59Z`) / 1000);

    const { data: numeri } = await admin
      .from("ai_whatsapp_numbers")
      .select("id, numero, display_name, waba_id")
      .eq("company_id", companyId)
      .eq("provider", "meta_cloud")
      .is("deleted_at", null);

    const perAccount = new Map<string, { numeri: string[]; numeroId: string }>();
    for (const n of (numeri ?? []) as Array<{ id: string; numero: string | null; display_name: string | null; waba_id: string | null }>) {
      if (!n.waba_id) continue;
      const voce = perAccount.get(n.waba_id) ?? { numeri: [], numeroId: n.id };
      voce.numeri.push(`${n.display_name ?? "Numero"} ${n.numero ?? ""}`.trim());
      perAccount.set(n.waba_id, voce);
    }

    const account = [];
    for (const [wabaId, info] of perAccount) {
      const mittente = await resolveWhatsAppSender(admin, companyId, info.numeroId);
      if (!mittente?.accessToken) {
        account.push({ waba_id: wabaId, numeri: info.numeri, errore: "token non disponibile" });
        continue;
      }
      const campi = `currency,pricing_analytics.start(${inizio}).end(${fine}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`;
      const res = await fetch(
        `https://graph.facebook.com/${VERSIONE}/${wabaId}?fields=${encodeURIComponent(campi)}`,
        { headers: { Authorization: `Bearer ${mittente.accessToken}` } },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.error) {
        account.push({ waba_id: wabaId, numeri: info.numeri, errore: j?.error?.message ?? `HTTP ${res.status}` });
        continue;
      }
      const punti: Punto[] = (j.pricing_analytics?.data ?? []).flatMap((d: { data_points?: Punto[] }) => d.data_points ?? []);
      const somme = new Map<string, { categoria: string; tipo: string; messaggi: number; costo: number }>();
      for (const p of punti) {
        const chiave = `${p.pricing_category ?? "?"}|${p.pricing_type ?? "?"}`;
        const s = somme.get(chiave) ?? { categoria: p.pricing_category ?? "?", tipo: p.pricing_type ?? "?", messaggi: 0, costo: 0 };
        s.messaggi += Number(p.volume ?? 0);
        s.costo += Number(p.cost ?? 0);
        somme.set(chiave, s);
      }
      const righe = [...somme.values()].sort((a, b) => b.costo - a.costo);
      account.push({
        waba_id: wabaId,
        numeri: info.numeri,
        valuta: j.currency ?? null,
        messaggi: righe.reduce((t, r) => t + r.messaggi, 0),
        addebitato: Math.round(righe.reduce((t, r) => t + r.costo, 0) * 10000) / 10000,
        per_categoria: righe,
      });
    }

    return jsonResponse({ company_id: companyId, dal, al, account }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[whatsapp-costi-meta]", e);
    return errorResponse(e instanceof Error ? e.message : "Errore", 500, cors);
  }
});
