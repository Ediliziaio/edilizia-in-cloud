/**
 * silvio-canale-adapter — MP-SILVIO-07 · "molte bocche, un cervello"
 *
 * Adattatore tra un canale esterno (WhatsApp / voce) e l'unico orchestratore.
 * NON è un secondo cervello: normalizza l'input, verifica l'IDENTITÀ (numero→
 * utente verificato) PRIMA di qualsiasi azione, poi delega all'orchestratore.
 *
 * Sicurezza by-design:
 *  - auth interna fail-closed (INTERNAL_WORKER_KEY) — non è un endpoint pubblico.
 *  - identità non verificata → nessuna azione, si rimanda all'app.
 *  - confidenza bassa (voce/trascrizione) → si riformula, non si agisce.
 *  - l'orchestratore, per origini NON-utente, mette TUTTO in coda: nessuna azione
 *    sensibile parte da un canale ad auth debole; si conferma in app (coda MP-06).
 *
 * Questo edge è additivo: i webhook esistenti (whatsapp/voce) possono inoltrare
 * qui un messaggio operativo, senza che il loro flusso attuale cambi.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { richiedeRiformulazione, messaggioEsito, type Canale } from "../_shared/silvio-canali-logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("INTERNAL_WORKER_KEY") || "";

const CANALI_VALIDI = new Set<Canale>(["whatsapp", "voce"]);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  // fail-closed: senza chiave configurata l'edge è disabilitato (come whatsapp-ai-processor)
  if (!WORKER_KEY) {
    console.error("[silvio-canale-adapter] FATAL: INTERNAL_WORKER_KEY non configurato.");
    return json({ error: "servizio non disponibile" }, 503, cors);
  }
  if (req.headers.get("x-internal-worker-key") !== WORKER_KEY) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  const body = await req.json().catch(() => ({}));
  const canale = String(body.canale || "") as Canale;
  const identificativo = String(body.identificativo || "").trim();
  const testo = String(body.testo || "").trim();
  const confidenza: number | undefined = typeof body.confidenza === "number" ? body.confidenza : undefined;

  if (!CANALI_VALIDI.has(canale)) return json({ error: "canale_non_valido" }, 400, cors);
  if (!identificativo) return json({ error: "identificativo_mancante" }, 400, cors);
  if (!testo) return json({ ok: true, azione: "ignora", messaggio: "" }, 200, cors);

  // confidenza bassa (es. trascrizione voce incerta) → non agire, riformula
  if (richiedeRiformulazione(confidenza)) {
    return json({ ok: true, azione: "riformula", messaggio: "Non ho capito bene. Puoi ripetere in modo più semplice?" }, 200, cors);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // IDENTITÀ prima dell'azione: numero → utente verificato (auth debole del canale)
    const { data: ident, error: idErr } = await supa.rpc("silvio_canale_risolvi_utente", {
      p_canale: canale, p_identificativo: identificativo,
    });
    if (idErr) throw idErr;
    const riga = Array.isArray(ident) ? ident[0] : ident;
    const companyId: string | null = riga?.company_id ?? null;

    if (!companyId) {
      return json({
        ok: true, azione: "verifica_identita",
        messaggio: "Per agire devo collegare questo numero al tuo account. Apri l'app e verifica il canale in Impostazioni → Silvio.",
      }, 200, cors);
    }

    // delega all'unico cervello — origine = canale ⇒ tutto in coda (sicuro)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/silvio-orchestratore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        origine: canale, richiesta: testo, company_id: companyId,
        contesto: { canale, identificativo },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, azione: "errore", messaggio: "Si è verificato un problema. Riprova più tardi." }, 200, cors);

    const inviati = Number(j.inviati || 0);
    const inCoda = Number(j.in_coda || 0);
    const ok = j.ok !== false;
    return json({
      ok: true,
      azione: !ok ? "riformula" : inCoda > 0 ? "in_coda" : "fatto",
      messaggio: messaggioEsito(inviati, inCoda, ok),
      dettaglio: { inviati, in_coda: inCoda },
    }, 200, cors);
  } catch (e) {
    console.error("[silvio-canale-adapter] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
