// openwa-gateway — proxy autenticato (super_admin) verso il gateway OpenWA
// self-hosted (WhatsApp Locale, canale NON-ufficiale, solo piattaforma).
//
// Separato al 100% dal canale Meta ufficiale. Contratto REST allineato a
// openapi.json di rmyndharis/OpenWA. Config gateway in platform_settings.
//
// Azioni: create_session | restart_session | get_qr | get_pairing_code
//         | session_status | delete_session | send_text | send_media

import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import {
  getOwaConfig, owaFetch, OWA_PATHS, sendOpenWaMessage, romeToday,
  type OwaConfig,
} from "../_shared/openwaSend.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
// URL pubblico del webhook (il gateway esterno lo chiama a ogni evento).
function webhookUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/openwa-webhook`;
}

// Il gateway accetta come nome sessione SOLO lettere, numeri e trattini
// (openapi: "alphanumeric and hyphens only"): un nome come "Account Giusy"
// veniva rifiutato con 400 Bad Request. Il nome scritto dall'utente resta
// intatto in display_name, qui se ne ricava la versione tecnica.
function nomeSessione(displayName: string): string {
  const slug = displayName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // via gli accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `eic-${slug}` : `eic-${crypto.randomUUID().slice(0, 8)}`;
}

/** Id della sessione che sul gateway ha questo NOME, se c'è.
 *
 *  Il gateway identifica le sessioni per id, ma le crea con un nome unico. Se
 *  perde l'id che avevamo salvato (riavvio, volume ripulito) ma conserva la
 *  sessione, `start` risponde 404 e `create` risponde 409 "Session with name
 *  … already exists": due risposte in contraddizione che lasciavano il numero
 *  irrecuperabile dalla UI. Qui lo ritroviamo per nome e ne adottiamo l'id. */
async function idSessionePerNome(cfg: OwaConfig, name: string): Promise<string | null> {
  const r = await owaFetch(cfg, "/api/sessions").catch(() => null);
  if (!r?.ok) return null;
  const payload = r.json as unknown;
  const lista: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] } | null)?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  for (const voce of lista) {
    const o = voce as { id?: string; sessionId?: string; name?: string; sessionName?: string };
    if ((o?.name ?? o?.sessionName) === name) return o?.id ?? o?.sessionId ?? null;
  }
  return null;
}

/** Il gateway dice "esiste già" (per nome), non "id sconosciuto". */
function eConflittoDiNome(r: { status: number; text?: string }): boolean {
  return r.status === 409 || /already exists/i.test(r.text ?? "");
}

serveConMetriche("openwa-gateway", async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  const jsonH = { ...corsH, "Content-Type": "application/json" };

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const { action, ...body } = await req.json();

    // Config gateway (lancia se non configurato).
    let cfg;
    try {
      cfg = await getOwaConfig();
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: jsonH });
    }

    // ── ping: verifica che base URL + API key raggiungano il gateway ──────────
    if (action === "ping") {
      const r = await owaFetch(cfg, "/api/sessions");
      if (!r.ok) {
        return new Response(JSON.stringify({ error: `Gateway irraggiungibile: ${r.status} ${r.text}`.slice(0, 300) }), { status: 502, headers: jsonH });
      }
      const sessions = Array.isArray(r.json) ? r.json.length : (Array.isArray(r.json?.data) ? r.json.data.length : null);
      return new Response(JSON.stringify({ ok: true, sessions }), { headers: jsonH });
    }

    // ── create_session: crea → start → registra webhook → salva numero ────────
    if (action === "create_session") {
      const displayName: string = (body.display_name ?? "").trim();
      const name = nomeSessione(displayName);

      const created = await owaFetch(cfg, OWA_PATHS.createSession(), {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      let sessionId: string = created.ok ? (created.json?.id ?? created.json?.session?.id ?? "") : "";
      if (!created.ok) {
        // "Esiste già" non è un errore da mostrare: la sessione sul gateway c'è,
        // siamo noi ad averne perso l'id. Adottarla è l'unico modo di non
        // bruciare quel nome per sempre (ricrearlo darà 409 in eterno).
        const esistente = eConflittoDiNome(created) ? await idSessionePerNome(cfg, name) : null;
        if (!esistente) {
          return new Response(JSON.stringify({ error: `Gateway: ${created.status} ${created.text}` }), { status: 502, headers: jsonH });
        }
        const { data: giaInElenco } = await supabaseAdmin
          .from("openwa_numbers")
          .select("id, display_name")
          .eq("session_id", esistente)
          .is("deleted_at", null)
          .maybeSingle();
        if (giaInElenco) {
          return new Response(JSON.stringify({
            error: `Questo numero è già in elenco come "${giaInElenco.display_name ?? "senza nome"}": usa Ricollega, non Collega numero.`,
          }), { status: 409, headers: jsonH });
        }
        sessionId = esistente;
      }
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Gateway: id sessione mancante nella risposta." }), { status: 502, headers: jsonH });
      }

      // Avvia la sessione (necessario prima di QR / pairing-code).
      await owaFetch(cfg, OWA_PATHS.startSession(sessionId), { method: "POST" }).catch(() => null);

      // Registra il webhook per questa sessione (best-effort; ripetibile).
      const secret = (await getPlatformSetting("openwa_webhook_secret")).trim();
      await owaFetch(cfg, OWA_PATHS.createWebhook(sessionId), {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl(),
          events: ["message.received", "session.status"],
          ...(secret ? { secret } : {}),
        }),
      }).catch(() => null);

      const { data: inserted, error } = await supabaseAdmin
        .from("openwa_numbers")
        .insert({ session_id: sessionId, display_name: displayName || null, stato: "connecting" })
        .select("id, session_id, display_name, stato")
        .single();
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ ok: true, number: inserted }), { headers: jsonH });
    }

    // ── restart_session: ricollega un numero già in lista senza scollegarlo ──
    // Serve quando il telefono ha perso il collegamento (o la sessione sul
    // gateway è morta): prima l'unica via era "Scollega" + "Collega numero",
    // che cancellava tag, limiti e riscaldamento. Qui la riga resta la stessa.
    // Se la sessione non esiste più sul gateway (404) se ne crea una nuova con
    // lo stesso nome e si aggiorna session_id sulla riga.
    if (action === "restart_session") {
      const sessionId: string = (body.session_id ?? "").trim();
      if (!sessionId) return new Response(JSON.stringify({ error: "session_id richiesto" }), { status: 400, headers: jsonH });

      const { data: row } = await supabaseAdmin
        .from("openwa_numbers")
        .select("id, display_name")
        .eq("session_id", sessionId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!row) return new Response(JSON.stringify({ error: "Numero non trovato" }), { status: 404, headers: jsonH });

      let effectiveId = sessionId;
      let ricreata = false;
      // Il nome va calcolato UNA volta: senza display_name `nomeSessione` ne
      // genera uno casuale, e cercare col nome sbagliato non troverebbe nulla.
      const nomeAtteso = nomeSessione(row.display_name ?? "");
      const started = await owaFetch(cfg, OWA_PATHS.startSession(sessionId), { method: "POST" }).catch(() => null);
      if (!started || started.status === 404) {
        const created = await owaFetch(cfg, OWA_PATHS.createSession(), {
          method: "POST",
          body: JSON.stringify({ name: nomeAtteso }),
        });
        if (created.ok) {
          effectiveId = created.json?.id ?? created.json?.session?.id ?? "";
        } else {
          // start dice 404 e create dice 409: il gateway ha perso l'id ma non
          // la sessione. La ritroviamo per nome e ripartiamo da quella.
          const esistente = eConflittoDiNome(created) ? await idSessionePerNome(cfg, nomeAtteso) : null;
          if (!esistente) {
            return new Response(JSON.stringify({ error: `Gateway: ${created.status} ${created.text}` }), { status: 502, headers: jsonH });
          }
          effectiveId = esistente;
        }
        if (!effectiveId) {
          return new Response(JSON.stringify({ error: "Gateway: id sessione mancante nella risposta." }), { status: 502, headers: jsonH });
        }
        await owaFetch(cfg, OWA_PATHS.startSession(effectiveId), { method: "POST" }).catch(() => null);
        ricreata = true;
      }

      // Webhook: ripetibile, best-effort — sulla sessione nuova è obbligatorio.
      const secret = (await getPlatformSetting("openwa_webhook_secret")).trim();
      await owaFetch(cfg, OWA_PATHS.createWebhook(effectiveId), {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl(),
          events: ["message.received", "session.status"],
          ...(secret ? { secret } : {}),
        }),
      }).catch(() => null);

      const { error } = await supabaseAdmin
        .from("openwa_numbers")
        .update({ session_id: effectiveId, stato: "connecting", last_seen_at: new Date().toISOString(), errori_consecutivi: 0, ultimo_errore: null })
        .eq("id", row.id);
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ ok: true, session_id: effectiveId, ricreata }), { headers: jsonH });
    }

    // ── get_qr: QR (data-uri PNG) per il pairing ──────────────────────────────
    if (action === "get_qr") {
      const sessionId: string = (body.session_id ?? "").trim();
      if (!sessionId) return new Response(JSON.stringify({ error: "session_id richiesto" }), { status: 400, headers: jsonH });

      const r = await owaFetch(cfg, OWA_PATHS.getQr(sessionId));
      if (!r.ok) return new Response(JSON.stringify({ error: `Gateway: ${r.status} ${r.text}` }), { status: 502, headers: jsonH });
      const qr = r.json?.qrCode ?? r.json?.qr ?? r.json?.data ?? r.text;
      return new Response(JSON.stringify({ ok: true, qr, status: r.json?.status ?? null }), { headers: jsonH });
    }

    // ── get_pairing_code: alternativa al QR (codice 8 cifre via telefono) ──────
    if (action === "get_pairing_code") {
      const sessionId: string = (body.session_id ?? "").trim();
      const phone: string = (body.phone ?? "").replace(/[^\d]/g, "");
      if (!sessionId || !phone) return new Response(JSON.stringify({ error: "session_id e phone richiesti" }), { status: 400, headers: jsonH });

      const r = await owaFetch(cfg, OWA_PATHS.pairingCode(sessionId), {
        method: "POST",
        body: JSON.stringify({ phoneNumber: phone }),
      });
      if (!r.ok) return new Response(JSON.stringify({ error: `Gateway: ${r.status} ${r.text}` }), { status: 502, headers: jsonH });
      return new Response(JSON.stringify({ ok: true, pairing_code: r.json?.pairingCode ?? null, status: r.json?.status ?? null }), { headers: jsonH });
    }

    // ── session_status: stato + sync numero rilevato ─────────────────────────
    if (action === "session_status") {
      const sessionId: string = (body.session_id ?? "").trim();
      if (!sessionId) return new Response(JSON.stringify({ error: "session_id richiesto" }), { status: 400, headers: jsonH });

      const r = await owaFetch(cfg, OWA_PATHS.status(sessionId));
      if (!r.ok) return new Response(JSON.stringify({ error: `Gateway: ${r.status} ${r.text}` }), { status: 502, headers: jsonH });

      const raw = String(r.json?.status ?? r.json?.state ?? "").toLowerCase();
      // Stessa regola del webhook: "disconnected" contiene "connect".
      const stato = raw.includes("ban") ? "banned"
        : /disconnect|unpaired|logout|logged_out|close|timeout|conflict|unlaunched/.test(raw) ? "disconnected"
        : /^(connected|ready|authenticated|open|inchat|online)$/.test(raw) ? "connected"
        : "connecting";
      const connected = stato === "connected";
      const numero = r.json?.phone ?? r.json?.me?.phone ?? null;
      const pushName = r.json?.pushName ?? null;

      const patch: Record<string, unknown> = { stato, last_seen_at: new Date().toISOString() };
      if (numero) patch.numero = numero.startsWith("+") ? numero : `+${numero}`;
      // Il nome del telefono (pushName) vale solo come DEFAULT: se l'utente ha
      // rinominato il numero, ogni controllo di stato glielo rimetteva com'era
      // (ecco perché due numeri diversi si chiamavano entrambi "Giusy").
      if (pushName) {
        const { data: cur } = await supabaseAdmin
          .from("openwa_numbers").select("display_name")
          .eq("session_id", sessionId).is("deleted_at", null).maybeSingle();
        if (!(cur?.display_name ?? "").trim()) patch.display_name = pushName;
      }
      await supabaseAdmin.from("openwa_numbers").update(patch).eq("session_id", sessionId).is("deleted_at", null);

      // Alla prima connessione fissa la data di warm-up (anti-ban).
      if (connected) {
        await supabaseAdmin.from("openwa_numbers")
          .update({ connected_since: romeToday() })
          .eq("session_id", sessionId).is("connected_since", null);
      }

      return new Response(JSON.stringify({ ok: true, stato, numero }), { headers: jsonH });
    }

    // ── delete_session: scollega (soft-delete) ───────────────────────────────
    if (action === "delete_session") {
      const sessionId: string = (body.session_id ?? "").trim();
      if (!sessionId) return new Response(JSON.stringify({ error: "session_id richiesto" }), { status: 400, headers: jsonH });

      await owaFetch(cfg, OWA_PATHS.deleteSession(sessionId), { method: "DELETE" }).catch(() => null);
      const { error } = await supabaseAdmin
        .from("openwa_numbers")
        .update({ deleted_at: new Date().toISOString(), stato: "disconnected" })
        .eq("session_id", sessionId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ ok: true }), { headers: jsonH });
    }

    // ── send_text: invia (rotazione tag+cap o override numero) ────────────────
    if (action === "send_text") {
      const res = await sendOpenWaMessage(supabaseAdmin, {
        to: body.to,
        contactId: body.contact_id ?? null,
        text: body.text,
        numberId: body.number_id ?? null,
        contactTags: Array.isArray(body.contact_tags) ? body.contact_tags : undefined,
        bypassQuietHours: true, // invio manuale super_admin: nessun blocco orario
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: res.error }), { status: res.status ?? 400, headers: jsonH });
      }
      return new Response(JSON.stringify({ ok: true, number_id: res.numberId, chat_id: res.chatId }), { headers: jsonH });
    }

    // ── send_media: invia immagine/documento (media già su bucket openwa-media) ─
    if (action === "send_media") {
      const res = await sendOpenWaMessage(supabaseAdmin, {
        to: body.to,
        contactId: body.contact_id ?? null,
        text: body.caption ?? body.text ?? "",
        numberId: body.number_id ?? null,
        mediaPath: body.media_path,
        mediaKind: body.media_kind === "document" ? "document" : "image",
        mediaFilename: body.media_filename,
        bypassQuietHours: true,
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: res.error }), { status: res.status ?? 400, headers: jsonH });
      }
      return new Response(JSON.stringify({ ok: true, number_id: res.numberId, chat_id: res.chatId }), { headers: jsonH });
    }

    return new Response(JSON.stringify({ error: `Azione sconosciuta: ${action}` }), { status: 400, headers: jsonH });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "Errore interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
