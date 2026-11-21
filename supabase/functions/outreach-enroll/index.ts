import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { firstEmailStep, nonEmailStepCount, computeStepSchedule, type SeqStep } from "../_shared/outreach-sequence.ts";
import { effectiveDailyCap } from "../_shared/outreach-dispatch-logic.ts";
import { spreadFirstTouch } from "../_shared/outreach-spread.ts";
import { isPecEmail, isRoleEmail, domainOf, domainHasMx } from "../_shared/outreach-email-check.ts";
import { classifyEmail } from "../_shared/email-quality.ts";
import { esitoPagina } from "../_shared/outreach-enroll-page.ts";

/**
 * outreach-enroll — il SUPER_ADMIN iscrive contatti a una sequenza cold.
 *
 * Per ogni contatto idoneo crea un'iscrizione (outreach_enrollments) e mette in
 * coda il PRIMO step email (outreach_send_queue): da lì il dispatcher invia e fa
 * avanzare la cadenza step-by-step. Filtra a monte chi non va contattato:
 *   • niente email · opt-out email · in blocklist (email_suppressions) · già iscritto.
 *
 * Selettori (almeno uno): contact_ids[] | tag | source | list_id | scope:'all'.
 * `quanti` (facoltativo) = quanti iscriverne in questa chiamata: si arruola a
 * ONDATE. Le caselle smaltiscono poche decine di primi contatti al giorno, e
 * ogni contatto costa due RPC (prospect + lock) più un controllo MX: migliaia
 * in una chiamata sola sforerebbero il limite di tempo della funzione.
 * La finestra d'invio (Lun-Ven, orari) la applica il dispatcher: qui le date di
 * schedulazione sono grezze.
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const MAX_CONTACTS = 500;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// Oltre questo tempo si smette di valutare/bloccare nuovi contatti e si iscrive
// ciò che è già pronto: un kill a metà lascerebbe lock multi-brand acquisiti
// senza iscrizione (aziende bloccate per 25 giorni a vuoto). Margini stretti:
// oltre ~60 s la connessione col browser cade («Failed to send a request»)
// anche se il lavoro finisce, e chi arruolava vedeva un errore su un'ondata
// riuscita. Un giro sta sotto i 40 s; il dialog ripete i giri da solo.
const BUDGET_VALUTAZIONE_MS = 20_000;

interface ContactRow {
  id: string;
  email: string | null;
  optout_email: boolean | null;
  unsubscribed?: boolean | null;
  opt_out?: boolean | null;
  iscritto: boolean;
  ricontatta_dopo?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const avviatoAlle = Date.now();
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const sequenceId = typeof body?.sequence_id === "string" ? body.sequence_id : "";
    if (!sequenceId) return errorResponse("sequence_id mancante", 400, corsH);

    const contactIds: string[] = Array.isArray(body?.contact_ids)
      ? body.contact_ids.map((x: unknown) => String(x)).filter(Boolean)
      : [];
    const tag = typeof body?.tag === "string" && body.tag.trim() ? body.tag.trim() : "";
    const source = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "";
    const all = body?.scope === "all" || body?.all === true;
    // Filtri ICP (facoltativi, combinabili con tag/source): provincia e citta'.
    const filtri = (body?.filtri && typeof body.filtri === "object") ? body.filtri as Record<string, unknown> : {};
    const provincia = typeof filtri.provincia === "string" ? filtri.provincia.trim() : "";
    const citta = typeof filtri.citta === "string" ? filtri.citta.trim() : "";
    // Qualita' indirizzi: di default fuori PEC, indirizzi generici (info@…) e domini senza MX.
    const includiRole = body?.includi_role === true;
    const includiPec = body?.includi_pec === true;
    const verificaMx = body?.verifica_mx !== false;
    const listId = typeof body?.list_id === "string" && body.list_id.trim() ? body.list_id.trim() : "";
    const after = typeof body?.after === "string" && body.after ? body.after : null;
    if ((after && !UUID.test(after)) || contactIds.some((id) => !UUID.test(id))) {
      return errorResponse("Riferimento contatto non valido", 400, corsH);
    }
    const quantiRaw = Number(body?.quanti);
    const quanti = Number.isFinite(quantiRaw) && quantiRaw > 0 ? Math.min(Math.floor(quantiRaw), MAX_CONTACTS) : MAX_CONTACTS;
    if (!contactIds.length && !tag && !source && !all && !provincia && !citta && !listId) {
      return errorResponse("Specifica chi iscrivere: contact_ids, tag, source, list_id, filtri (provincia/citta) oppure scope:'all'.", 400, corsH);
    }

    // 1. sequenza + step
    const { data: seq, error: seqErr } = await admin
      .from("outreach_sequences").select("id,status,brand_id").eq("id", sequenceId).eq("company_id", PLATFORM_COMPANY).maybeSingle();
    if (seqErr) throw seqErr;
    if (!seq) return errorResponse("Sequenza non trovata", 404, corsH);
    if (!seq.brand_id) return errorResponse("Assegna un brand alla sequenza prima di iscrivere i contatti.", 409, corsH);
    if (seq.status === "archived") return errorResponse("La sequenza è archiviata: ripristinala prima di iscrivere contatti.", 409, corsH);

    const { data: stepsRaw, error: stepErr } = await admin
      .from("outreach_sequence_steps")
      .select("step_order,channel,delay_days,delay_hours,subject,body")
      .eq("sequence_id", sequenceId).order("step_order", { ascending: true });
    if (stepErr) throw stepErr;
    const steps = (stepsRaw ?? []) as SeqStep[];
    const first = firstEmailStep(steps);
    if (!first?.subject?.trim() || !first.body?.trim()) {
      return errorResponse("Completa il primo passaggio email con oggetto e testo prima di iscrivere.", 400, corsH);
    }

    if (listId) {
      const { data: lista, error } = await admin.from("marketing_contact_lists")
        .select("id").eq("id", listId).eq("company_id", PLATFORM_COMPANY).maybeSingle();
      if (error) throw error;
      if (!lista) return errorResponse("Lista non trovata", 404, corsH);
    }
    const { data: candidati, error: cErr } = await admin.rpc("outreach_candidati_lista", {
      p_sequence: sequenceId, p_after: after, p_list: listId || null, p_tag: tag || null,
      p_source: source || null, p_province: provincia || null, p_city: citta || null,
      p_ids: contactIds.length ? contactIds : null,
    });
    if (cErr) throw cErr;
    const contacts = ((candidati ?? []) as ContactRow[]).slice(0, MAX_CONTACTS);
    const stats = {
      tempo_scaduto: false,
      non_email_steps_skipped: nonEmailStepCount(steps),
      lock_negato_per_motivo: {} as Record<string, number>,
    };
    const esiti = new Map<string, string>();
    const risposta = (extra: { note?: string; scheduled_for?: string } = {}) => {
      const pagina = esitoPagina(contacts, esiti, (candidati?.length ?? 0) > MAX_CONTACTS);
      return jsonResponse({ enrolled: 0, ...stats, ...pagina, truncated: pagina.altri, ...extra }, 200, corsH);
    };
    if (!contacts.length) return risposta({ note: "Fine della lista." });

    // 4. filtro, in due passate.
    // Prima i controlli che non costano nulla (email, opt-out, cooldown, PEC,
    // indirizzi generici) su tutti; poi blocklist e MX solo su chi resta, e ci
    // si ferma appena l'ondata è piena.
    const norm = (e: string) => e.toLowerCase().trim();
    const nowMs = Date.now();
    // Chi è già cliente (utente di un'azienda EiC, o stesso dominio aziendale)
    // non riceve mai un cold: si legge il proprio gestionale che gli scrive
    // come a uno sconosciuto.
    const clientiEic = new Set<string>();
    const dominiClientiEic = new Set<string>();
    {
      const { data: utenti } = await admin.from("profiles").select("email").not("company_id", "is", null).limit(5000);
      for (const u of (utenti ?? []) as { email: string | null }[]) if (u.email) clientiEic.add(norm(u.email));
      const { data: aziende } = await admin.from("companies").select("email").is("deleted_at", null).limit(2000);
      for (const a of (aziende ?? []) as { email: string | null }[]) {
        if (!a.email) continue;
        const q = classifyEmail(a.email);
        if (q.domain && !q.isFree) dominiClientiEic.add(q.domain);
      }
    }
    const puliti: ContactRow[] = [];
    for (const c of contacts) {
      const statsMark = (esito: string) => esiti.set(c.id, esito);
      if (c.iscritto) { statsMark("skipped_already"); continue; }
      if (!c.email) { statsMark("skipped_no_email"); continue; }
      // Tre campi dicono «non scrivermi»: prima se ne leggeva uno.
      if (c.optout_email || c.unsubscribed || c.opt_out) { statsMark("skipped_optout"); continue; }
      const qualita = classifyEmail(c.email);
      if (!qualita.syntaxValid || qualita.isDisposable) { statsMark("skipped_sintassi"); continue; }
      // «…@ditta.itpec»: l'indirizzo si è portato dietro la parola dopo. Il
      // server del destinatario lo rifiuta e il rifiuto pesa su di noi.
      if (qualita.codaAttaccata) { statsMark("skipped_email_storta"); continue; }
      if (clientiEic.has(norm(c.email)) || (qualita.domain && dominiClientiEic.has(qualita.domain))) { statsMark("skipped_cliente"); continue; }
      if (c.ricontatta_dopo && Date.parse(c.ricontatta_dopo) > nowMs) { statsMark("skipped_cooldown"); continue; }
      if (!includiPec && isPecEmail(c.email)) { statsMark("skipped_pec"); continue; }
      if (!includiRole && isRoleEmail(c.email)) { statsMark("skipped_role"); continue; }
      puliti.push(c);
    }
    // Blocklist a blocchi e con l'errore controllato: con migliaia di indirizzi
    // un solo .in() superava la lunghezza massima dell'URL, la risposta era un
    // errore ignorato e la blocklist saltava in silenzio.
    const suppressed = new Set<string>();
    const emailPuliti = [...new Set(puliti.map((c) => norm(c.email as string)))];
    for (let i = 0; i < emailPuliti.length; i += 200) {
      const { data: sup, error: supErr } = await admin
        .from("email_suppressions").select("email_normalized")
        .eq("company_id", PLATFORM_COMPANY).in("email_normalized", emailPuliti.slice(i, i + 200));
      if (supErr) throw supErr;
      for (const s of sup ?? []) suppressed.add(String((s as { email_normalized: string }).email_normalized));
    }
    const eligible: ContactRow[] = [];
    const mxCache = new Map<string, boolean>();
    // MX a gruppi in parallelo: un dominio nuovo costa una query DNS, e in
    // sequenza bastavano un paio di centinaia di domini mai visti per finire
    // il tempo del giro.
    const GRUPPO_MX = 10;
    for (let i = 0; i < puliti.length && eligible.length < quanti; i += GRUPPO_MX) {
      if (Date.now() - avviatoAlle > BUDGET_VALUTAZIONE_MS) { stats.tempo_scaduto = true; break; }
      const gruppo = puliti.slice(i, i + GRUPPO_MX);
      const conMx = await Promise.all(gruppo.map((c) =>
        verificaMx && !suppressed.has(norm(c.email as string))
          ? domainHasMx(admin, domainOf(c.email as string), mxCache) : true,
      ));
      for (const [k, c] of gruppo.entries()) {
        if (eligible.length >= quanti) break;
        if (suppressed.has(norm(c.email as string))) esiti.set(c.id, "skipped_suppressed");
        else if (!conMx[k]) esiti.set(c.id, "skipped_no_mx");
        else eligible.push(c);
      }
    }
    if (!eligible.length) return risposta();

    // 4-bis. LOCK MULTI-BRAND — nessun contatto entra in sequenza senza.
    //
    // Quattro dei cinque brand AEDIX parlano alla stessa impresa edile: senza
    // questo, Mario Rossi riceve nella stessa settimana una mail da Edilizia in
    // Cloud, una da Numeri in Edilizia e una da Marketing Edile. Capisce che
    // sono la stessa gente — o peggio, pensa di essere finito in una lista
    // venduta — e marca spam tre volte. Tre domini bruciati con un contatto.
    //
    // Il lock e' per AZIENDA, non per contatto: due persone della stessa
    // impresa non ricevono da brand diversi. Si acquisisce una volta per
    // azienda e vale per tutti i suoi contatti.
    const conLock: ContactRow[] = [];
    const esitoPerAzienda = new Map<string, string | null>();
    const aziendeInOndata = new Set<string>();
    for (const c of eligible) {
      if (Date.now() - avviatoAlle > BUDGET_VALUTAZIONE_MS + 15_000) { stats.tempo_scaduto = true; break; }
      const { data: aziendaId, error: prospectErr } = await admin.rpc("outreach_ensure_prospect", { p_contact_id: c.id });
      if (prospectErr) throw prospectErr;
      if (!aziendaId) { esiti.set(c.id, "skipped_senza_azienda"); continue; }
      const chiave = String(aziendaId);

      let motivo = esitoPerAzienda.get(chiave);
      if (motivo === undefined) {
        const { data: esito, error: lockErr } = await admin.rpc("outreach_acquire_brand_lock", {
          p_prospect_company_id: chiave, p_brand_id: seq.brand_id, p_durata_gg: 25,
        });
        if (lockErr) throw lockErr;
        const riga = Array.isArray(esito) ? esito[0] : esito;
        motivo = riga?.ok ? null : String(riga?.motivo ?? "sconosciuto").split(":")[0];
        esitoPerAzienda.set(chiave, motivo);
      }
      if (motivo) {
        esiti.set(c.id, "skipped_lock");
        stats.lock_negato_per_motivo[motivo] = (stats.lock_negato_per_motivo[motivo] ?? 0) + 1;
        continue;
      }
      if (aziendeInOndata.has(chiave)) { esiti.set(c.id, "skipped_stessa_azienda"); continue; }
      const { count: giaInSequenza, error: attiviErr } = await admin.from("outreach_prospect_contacts")
        .select("id", { count: "exact", head: true })
        .eq("prospect_company_id", chiave).eq("stato", "in_sequence");
      if (attiviErr) throw attiviErr;
      if ((giaInSequenza ?? 0) > 0) { esiti.set(c.id, "skipped_stessa_azienda"); continue; }
      aziendeInOndata.add(chiave);
      conLock.push(c);
    }
    if (!conLock.length) return risposta();

    // 5. iscrivi + accoda il primo step (a blocchi)
    const now = new Date();
    const inizio = computeStepSchedule(now, first.delay_days, first.delay_hours);
    // Primo contatto SPARPAGLIATO in base alla capacita' del pool del brand:
    // prima tutti avevano lo stesso scheduled_for e partivano a raffica.
    let capPool = 0;
    try {
      const { data: pool } = await admin
        .from("outreach_sender_accounts")
        .select("status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,brand_id,connection_status")
        .in("status", ["active", "warming"]);
      capPool = ((pool ?? []) as any[])
        .filter((s) => (!seq.brand_id || s.brand_id === seq.brand_id) && s.connection_status !== "error")
        .reduce((sum, s) => sum + effectiveDailyCap(s), 0);
    } catch { /* senza pool: un contatto per finestra */ }
    const orari = spreadFirstTouch({ start: inizio, count: conLock.length, capPerDay: capPool });
    const { data: iscritti, error: accodaErr } = await admin.rpc("outreach_accoda_iscrizioni", {
      p_sequence: sequenceId, p_brand: seq.brand_id, p_step: first.step_order, p_stato: seq.status,
      p_candidates: conLock.map((c, i) => ({ id: c.id, email: c.email, quando: orari[i].toISOString() })),
    });
    if (accodaErr) throw accodaErr;
    const nuovi = new Set(iscritti as string[]);
    for (const c of conLock) esiti.set(c.id, nuovi.has(c.id) ? "enrolled" : "skipped_modificati");
    return risposta({ scheduled_for: inizio.toISOString() });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-enroll error:", e);
    return errorResponse("Errore durante l'iscrizione alla sequenza", 500, corsH);
  }
});
