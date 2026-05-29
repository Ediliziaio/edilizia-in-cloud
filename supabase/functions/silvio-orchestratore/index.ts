/**
 * silvio-orchestratore — MP-SILVIO-02 (esecuzione) · il cervello operativo
 *
 * Cascata intento→piano→esecuzione a basso costo:
 *   gradino 0 deterministico (gratis) → 1 Haiku (piano JSON) → 2 Sonnet (solo se serve)
 * Il modello produce SOLO un PIANO di azioni del REGISTRO (MP-SILVIO-01); il codice:
 *   - valida il piano sul registro (azioni ignote → rifiutate)
 *   - applica i permessi via silvio_puo_eseguire (regola ferrea inclusa)
 *   - esegue le 'autonoma' (dispatcher conservativo) · mette le 'conferma' in CODA (MP-06)
 *   - traccia TUTTO in silvio_audit (append-only)
 * Sicurezza: trigger/playbook (senza utente) → tutto in coda, mai auto-eseguito.
 * Auth: Bearer utente (origine 'richiesta') · service role / x-cron-secret (trigger/playbook).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import {
  validaPiano, matchDeterministico, serveSonnet, stimaCostoToken, type Piano,
} from "../_shared/silvio-orchestratore-logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_ROLE;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-5";

// gradino 0: comandi diretti → azione del registro
const COMANDI: Record<string, string> = {
  "crea la bozza di questa fattura": "crea_bozza_fattura_passiva",
  "registra la fattura": "crea_bozza_fattura_passiva",
  "apri opportunità": "apri_opportunita_preventivo",
  "apri un'opportunità": "apri_opportunita_preventivo",
  "aggiungi la scadenza": "aggiungi_scadenza_previsionale",
  "rispondi con ai": "genera_bozza_risposta",
  "genera una risposta": "genera_bozza_risposta",
  "collega al cantiere": "collega_email_entita",
};

// dispatcher: quali funzioni_target sono edge function chiamabili genericamente
const EDGE_TARGETS = new Set([
  "email-ai-estrai-allegato", "email-ai-ddt-carico", "email-ai-opportunita",
  "email-ai-scadenza", "email-ai-evento", "email-ai-l4-draft",
]);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isService = !!token && token === SERVICE_ROLE;
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

  const body = await req.json().catch(() => ({}));
  const origine: string = body.origine || "richiesta";
  const richiesta: string = (body.richiesta || "").toString();

  // ── Auth + contesto ────────────────────────────────────────────────────────
  let userId: string | null = null;
  let companyId: string | null = body.company_id ?? null;
  let userClient = supa; // per silvio_puo_eseguire serve il contesto utente
  const autoConsentito = origine === "richiesta" && !isService && !isCron;

  if (autoConsentito) {
    const { data: u } = await supa.auth.getUser(token);
    if (!u.user) return json({ error: "Unauthorized" }, 401, cors);
    userId = u.user.id;
    userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: cid } = await userClient.rpc("get_effective_company_id");
    companyId = (cid as string) ?? companyId;
  } else if (!(isService || isCron)) {
    return json({ error: "Unauthorized" }, 401, cors);
  }
  if (!companyId) return json({ error: "company_richiesta" }, 400, cors);

  try {
    // ── Catalogo (chiavi valide + funzione_target) ────────────────────────────
    const { data: catRows } = await supa.from("silvio_azioni").select("chiave, funzione_target, attiva").eq("attiva", true);
    const catalogo = new Map<string, string>(((catRows as any[]) || []).map((r) => [r.chiave, r.funzione_target]));
    const chiaviValide = [...catalogo.keys()];

    // ── Costruzione piano ─────────────────────────────────────────────────────
    let piano: Piano | null = body.piano ?? null;
    let gradino = 0;
    let tokenIn = 0, tokenOut = 0;

    if (!piano && richiesta) {
      const det = matchDeterministico(richiesta, COMANDI);
      if (det) {
        piano = { intento: det, passi: [{ azione: det, parametri: body.contesto || {} }], confidenza: 1 };
        gradino = 0;
      } else if (ANTHROPIC_API_KEY) {
        gradino = 1;
        const sys = `Sei l'orchestratore di un gestionale edile. Converti la richiesta in un PIANO JSON di azioni.
USA SOLO queste azioni (chiave): ${chiaviValide.join(", ")}.
Output SOLO JSON: {"intento":"...","serve_ragionamento":false,"passi":[{"azione":"<chiave>","parametri":{}}],"confidenza":0.0-1.0}
Se non sei sicuro o serve giudizio, metti serve_ragionamento=true. Non inventare azioni fuori elenco.`;
        const r = await callAnthropic(HAIKU, sys, richiesta, body.contesto);
        tokenIn += r.tokenIn; tokenOut += r.tokenOut;
        piano = r.piano;
        if (piano && serveSonnet(piano)) {
          gradino = 2;
          const r2 = await callAnthropic(SONNET, sys, richiesta, body.contesto);
          tokenIn += r2.tokenIn; tokenOut += r2.tokenOut;
          if (r2.piano) piano = r2.piano;
        }
      }
    }

    // ── Validazione piano ─────────────────────────────────────────────────────
    const val = validaPiano(piano, chiaviValide);
    const { data: esecRow } = await supa.from("silvio_esecuzioni").insert({
      company_id: companyId, utente_id: userId, origine, origine_id: body.origine_id ?? null,
      intento: piano?.intento ?? richiesta?.slice(0, 200) ?? null, piano: piano ?? {}, gradino_max: gradino,
      stato: val.valido ? "pianificata" : "rifiutata", token_input: tokenIn, token_output: tokenOut,
      costo_stimato: stimaCostoToken(tokenIn, tokenOut),
    }).select("id").maybeSingle();
    const esecuzioneId = (esecRow as any)?.id ?? null;

    if (!val.valido) {
      return json({ ok: false, motivo: piano ? "piano_non_valido" : "nessun_piano",
        azioni_ignote: val.azioniIgnote, esecuzione_id: esecuzioneId,
        suggerimento: !piano ? "Riformula la richiesta o indica l'azione." : undefined }, 200, cors);
    }

    // ── Esecuzione passi ──────────────────────────────────────────────────────
    let inviati = 0, inCoda = 0, vietati = 0, errori = 0;
    for (const passo of piano!.passi) {
      const chiave = passo.azione;
      // permessi: solo origine utente li valuta; trigger/playbook → sempre coda (sicuro)
      let autor = "conferma";
      if (autoConsentito) {
        const { data: a } = await userClient.rpc("silvio_puo_eseguire", { p_chiave: chiave });
        autor = (a as string) || "vietata";
      }

      if (autor === "vietata") {
        vietati++;
        await audit(supa, companyId, chiave, "rifiutata", "autonoma", "permesso negato per il ruolo", origine, body.origine_id, userId, false);
        continue;
      }
      if (autor === "conferma" || !autoConsentito) {
        inCoda++;
        await supa.from("silvio_coda_conferme").insert({
          company_id: companyId, esecuzione_id: esecuzioneId, azione_chiave: chiave,
          parametri: passo.parametri || {}, anteprima: anteprima(chiave, passo.parametri), origine,
        });
        continue;
      }
      // autonoma → dispatcher conservativo
      const target = catalogo.get(chiave) || "";
      const res = await esegui(supa, target, chiave, passo.parametri || {}, companyId, userId, token);
      if (res.ok) {
        inviati++;
        await audit(supa, companyId, chiave, "eseguita", "autonoma", "azione autonoma sicura", origine, body.origine_id, userId, true);
      } else if (res.coda) {
        // non eseguibile in sicurezza → in coda invece di indovinare
        inCoda++;
        await supa.from("silvio_coda_conferme").insert({
          company_id: companyId, esecuzione_id: esecuzioneId, azione_chiave: chiave,
          parametri: passo.parametri || {}, anteprima: anteprima(chiave, passo.parametri), origine,
        });
      } else {
        errori++;
        await audit(supa, companyId, chiave, "errore", "autonoma", res.errore || "errore esecuzione", origine, body.origine_id, userId, true);
      }
    }

    if (companyId) await supa.rpc("silvio_budget_consuma", { p_company: companyId, p_token_in: tokenIn, p_token_out: tokenOut }).then(() => {}, () => {});
    const statoFinale = errori > 0 ? "parziale" : inCoda > 0 && inviati === 0 ? "in_attesa_conferma" : "eseguita";
    if (esecuzioneId) await supa.from("silvio_esecuzioni").update({ stato: statoFinale, esito: { inviati, in_coda: inCoda, vietati, errori } }).eq("id", esecuzioneId);

    return json({ ok: true, esecuzione_id: esecuzioneId, gradino, inviati, in_coda: inCoda, vietati, errori }, 200, cors);
  } catch (e) {
    console.error("[silvio-orchestratore] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

async function callAnthropic(model: string, system: string, richiesta: string, contesto: any): Promise<{ piano: Piano | null; tokenIn: number; tokenOut: number }> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 600, temperature: 0.2,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Richiesta: ${richiesta}\nContesto: ${JSON.stringify(contesto || {})}` }],
      }),
    });
    if (!resp.ok) return { piano: null, tokenIn: 0, tokenOut: 0 };
    const d = await resp.json();
    const txt = d.content?.[0]?.text || "{}";
    const m = txt.match(/\{[\s\S]*\}/);
    const piano = m ? JSON.parse(m[0]) as Piano : null;
    return { piano, tokenIn: d.usage?.input_tokens || 0, tokenOut: d.usage?.output_tokens || 0 };
  } catch { return { piano: null, tokenIn: 0, tokenOut: 0 }; }
}

// Dispatcher: esegue le autonome SOLO se sa farlo in sicurezza, altrimenti coda.
async function esegui(supa: any, target: string, chiave: string, parametri: any, companyId: string, userId: string | null, token: string): Promise<{ ok?: boolean; coda?: boolean; errore?: string }> {
  try {
    if (EDGE_TARGETS.has(target)) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(parametri),
      });
      const j = await res.json().catch(() => ({}));
      return res.ok && (j.ok !== false) ? { ok: true } : { errore: j.error || `HTTP ${res.status}` };
    }
    if (target === "digest_log") {
      await supa.from("digest_log").insert({ company_id: companyId, utente_id: userId, contenuto: { titolo: "Silvio", righe: [String(parametri?.testo || "Aggiornamento")] } });
      return { ok: true };
    }
    if (target === "email_collegamenti" && parametri?.email_id && parametri?.oggetto_id) {
      await supa.from("email_collegamenti").insert({
        email_id: parametri.email_id, oggetto_tipo: parametri.oggetto_tipo || "cantiere",
        oggetto_id: parametri.oggetto_id, company_id: companyId, origine: "silvio",
      });
      return { ok: true };
    }
    // non sappiamo eseguirla in sicurezza → coda (conferma umana)
    return { coda: true };
  } catch (e) {
    return { errore: e instanceof Error ? e.message : "errore" };
  }
}

async function audit(supa: any, companyId: string, chiave: string, esito: string, autonomia: string, motivo: string, origine: string, origineId: any, perConto: string | null, reversibile: boolean) {
  await supa.from("silvio_audit").insert({
    company_id: companyId, azione_chiave: chiave, esito, autonomia, motivo, origine,
    origine_id: origineId ?? null, per_conto_di: perConto, reversibile,
  }).then(() => {}, () => {});
}

function anteprima(chiave: string, parametri: any): string {
  const p = parametri && typeof parametri === "object"
    ? Object.entries(parametri).filter(([, v]) => v !== null && v !== undefined && v !== "").slice(0, 4).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")
    : "";
  return `${chiave}${p ? " — " + p : ""}`;
}

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
