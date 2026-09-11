import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { firstEmailStep, nonEmailStepCount, computeStepSchedule, type SeqStep } from "../_shared/outreach-sequence.ts";
import { effectiveDailyCap } from "../_shared/outreach-dispatch-logic.ts";
import { spreadFirstTouch } from "../_shared/outreach-spread.ts";
import { isPecEmail, isRoleEmail, domainOf, domainHasMx } from "../_shared/outreach-email-check.ts";

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
const MAX_CONTACTS = 5000;
// Oltre questo tempo si smette di valutare/bloccare nuovi contatti e si iscrive
// ciò che è già pronto: la funzione ha 150 s, e un kill a metà lascerebbe lock
// multi-brand acquisiti senza iscrizione (aziende bloccate per 25 giorni a vuoto).
const BUDGET_VALUTAZIONE_MS = 90_000;

interface ContactRow {
  id: string;
  email: string | null;
  optout_email: boolean | null;
  province?: string | null;
  city?: string | null;
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
    const quantiRaw = Number(body?.quanti);
    const quanti = Number.isFinite(quantiRaw) && quantiRaw > 0 ? Math.min(Math.floor(quantiRaw), MAX_CONTACTS) : MAX_CONTACTS;
    if (!contactIds.length && !tag && !source && !all && !provincia && !citta && !listId) {
      return errorResponse("Specifica chi iscrivere: contact_ids, tag, source, list_id, filtri (provincia/citta) oppure scope:'all'.", 400, corsH);
    }

    // 1. sequenza + step
    const { data: seq, error: seqErr } = await admin
      .from("outreach_sequences").select("id,status,brand_id").eq("id", sequenceId).maybeSingle();
    if (seqErr) throw seqErr;
    if (!seq) return errorResponse("Sequenza non trovata", 404, corsH);
    if (seq.status === "archived") return errorResponse("La sequenza è archiviata: ripristinala prima di iscrivere contatti.", 409, corsH);

    const { data: stepsRaw, error: stepErr } = await admin
      .from("outreach_sequence_steps")
      .select("step_order,channel,delay_days,delay_hours,subject,body")
      .eq("sequence_id", sequenceId).order("step_order", { ascending: true });
    if (stepErr) throw stepErr;
    const steps = (stepsRaw ?? []) as SeqStep[];
    const first = firstEmailStep(steps);
    if (!first) return errorResponse("La sequenza non ha step email: aggiungi almeno uno step email prima di iscrivere.", 400, corsH);

    // 2. iscrizioni già esistenti — lette PRIMA dei candidati e a pagine: la
    // lettura unica si fermava a 1000 righe, e un'ondata successiva su una
    // sequenza con più di 1000 iscritti avrebbe re-iscritto gli altri.
    const PAGE = 1000;
    const already = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data: righe, error: eErr } = await admin
        .from("outreach_enrollments").select("contact_id").eq("sequence_id", sequenceId)
        .order("contact_id", { ascending: true }).range(from, from + PAGE - 1);
      if (eErr) throw eErr;
      const r = (righe ?? []) as { contact_id: string }[];
      for (const e of r) already.add(String(e.contact_id));
      if (r.length < PAGE) break;
    }

    // 3. contatti candidati (platform company).
    // PostgREST tronca a max-rows (~1000) per singola risposta: una lista da
    // decine di migliaia di contatti veniva iscritta solo per i primi 1000,
    // in silenzio. Paginiamo con .range() fino a MAX_CONTACTS e segnaliamo se
    // il tetto viene comunque raggiunto.
    const COLS = "id,email,optout_email,province,city,ricontatta_dopo";
    const contacts: ContactRow[] = [];
    let truncated = false;
    const lista = { membri: 0, gia_iscritti: 0 };
    if (listId) {
      // Lista automatica: i membri li decide la sua regola. Si tolgono i già
      // iscritti e si caricano i dettagli a blocchi (un .in() con migliaia di
      // id non sta in un URL), nell'ordine della lista: l'ondata successiva
      // riparte da chi non è ancora entrato.
      const { data: l, error: lErr } = await admin.from("marketing_contact_lists")
        .select("id").eq("id", listId).eq("company_id", PLATFORM_COMPANY).maybeSingle();
      if (lErr) throw lErr;
      if (!l) return errorResponse("Lista non trovata", 404, corsH);
      const membri: string[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: righe, error: mErr } = await admin.from("marketing_contact_list_members")
          .select("contact_id").eq("list_id", listId)
          .order("contact_id", { ascending: true }).range(from, from + PAGE - 1);
        if (mErr) throw mErr;
        const r = (righe ?? []) as { contact_id: string }[];
        membri.push(...r.map((x) => String(x.contact_id)));
        if (r.length < PAGE) break;
      }
      lista.membri = membri.length;
      const nuovi = membri.filter((id) => !already.has(id));
      lista.gia_iscritti = membri.length - nuovi.length;
      const daCaricare = nuovi.slice(0, MAX_CONTACTS);
      truncated = nuovi.length > daCaricare.length;
      const blocchi: string[][] = [];
      for (let i = 0; i < daCaricare.length; i += 150) blocchi.push(daCaricare.slice(i, i + 150));
      for (let i = 0; i < blocchi.length; i += 4) {
        const esiti = await Promise.all(blocchi.slice(i, i + 4).map((ids) => {
          let q = admin.from("marketing_contacts").select(COLS).eq("company_id", PLATFORM_COMPANY).in("id", ids);
          if (provincia) q = q.ilike("province", provincia);
          if (citta) q = q.ilike("city", citta);
          return q;
        }));
        for (const { data: righe, error: cErr } of esiti) {
          if (cErr) throw cErr;
          contacts.push(...((righe ?? []) as ContactRow[]));
        }
      }
      const ordine = new Map(daCaricare.map((id, i) => [id, i]));
      contacts.sort((a, b) => (ordine.get(a.id) ?? 0) - (ordine.get(b.id) ?? 0));
    } else {
      for (let from = 0; from < MAX_CONTACTS; from += PAGE) {
        let q = admin
          .from("marketing_contacts")
          .select(COLS)
          .eq("company_id", PLATFORM_COMPANY)
          .order("id", { ascending: true })
          .range(from, Math.min(from + PAGE, MAX_CONTACTS) - 1);
        if (contactIds.length) q = q.in("id", contactIds);
        if (tag) q = q.contains("tags", [tag]);
        if (source) q = q.eq("source", source);
        if (provincia) q = q.ilike("province", provincia);
        if (citta) q = q.ilike("city", citta);
        const { data: pageRows, error: cErr } = await q;
        if (cErr) throw cErr;
        const rows = (pageRows ?? []) as ContactRow[];
        contacts.push(...rows);
        if (rows.length < PAGE) break;              // ultima pagina
        if (from + PAGE >= MAX_CONTACTS) truncated = true; // raggiunto il tetto
      }
    }

    const stats = {
      candidates: contacts.length,
      truncated, // true se la lista supera MAX_CONTACTS: iscritti solo i primi
      ondata: quanti < MAX_CONTACTS ? quanti : null,
      lista: listId ? lista : null,
      tempo_scaduto: false,
      enrolled: 0,
      skipped_no_email: 0,
      skipped_optout: 0,
      skipped_suppressed: 0,
      skipped_already: 0,
      skipped_role: 0,
      skipped_pec: 0,
      skipped_no_mx: 0,
      skipped_cooldown: 0,
      // lock multi-brand
      skipped_lock: 0,
      skipped_senza_azienda: 0,
      lock_non_applicato: 0,
      lock_negato_per_motivo: {} as Record<string, number>,
      non_email_steps_skipped: nonEmailStepCount(steps),
    };
    if (contacts.length === 0) {
      return jsonResponse({ ...stats, note: "Nessun contatto corrisponde ai criteri." }, 200, corsH);
    }

    // 4. filtro, in due passate.
    // Prima i controlli che non costano nulla (email, opt-out, cooldown, PEC,
    // indirizzi generici) su tutti; poi blocklist e MX solo su chi resta, e ci
    // si ferma appena l'ondata è piena.
    const norm = (e: string) => e.toLowerCase().trim();
    const nowMs = Date.now();
    const puliti: ContactRow[] = [];
    for (const c of contacts) {
      if (already.has(c.id)) { stats.skipped_already++; continue; }
      if (!c.email) { stats.skipped_no_email++; continue; }
      if (c.optout_email) { stats.skipped_optout++; continue; }
      if (c.ricontatta_dopo && Date.parse(c.ricontatta_dopo) > nowMs) { stats.skipped_cooldown++; continue; }
      if (!includiPec && isPecEmail(c.email)) { stats.skipped_pec++; continue; }
      if (!includiRole && isRoleEmail(c.email)) { stats.skipped_role++; continue; }
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
    for (const c of puliti) {
      if (eligible.length >= quanti) break;
      if (Date.now() - avviatoAlle > BUDGET_VALUTAZIONE_MS) { stats.tempo_scaduto = true; break; }
      if (suppressed.has(norm(c.email as string))) { stats.skipped_suppressed++; continue; }
      if (verificaMx && !(await domainHasMx(admin, domainOf(c.email as string), mxCache))) { stats.skipped_no_mx++; continue; }
      eligible.push(c);
    }
    if (eligible.length === 0) {
      return jsonResponse({ ...stats, note: "Nessun contatto idoneo (già iscritti / opt-out / in blocklist / senza email)." }, 200, corsH);
    }

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
    if (!seq.brand_id) {
      // Sequenza senza brand: il lock non ha su cosa agire. Non si blocca
      // (retrocompatibilita'), ma lo si dichiara nel risultato invece di
      // lasciarlo passare in silenzio.
      conLock.push(...eligible);
      stats.lock_non_applicato = eligible.length;
    } else {
      const esitoPerAzienda = new Map<string, boolean>();
      for (const c of eligible) {
        // Margine per le insert che seguono: meglio un'ondata più corta che un
        // kill a metà con lock presi e nessuna iscrizione.
        if (Date.now() - avviatoAlle > BUDGET_VALUTAZIONE_MS + 25_000) { stats.tempo_scaduto = true; break; }
        const { data: aziendaId } = await admin.rpc("outreach_ensure_prospect", { p_contact_id: c.id });
        if (!aziendaId) { stats.skipped_senza_azienda++; continue; }
        const chiave = String(aziendaId);

        let ok = esitoPerAzienda.get(chiave);
        if (ok === undefined) {
          const { data: esito } = await admin.rpc("outreach_acquire_brand_lock", {
            p_prospect_company_id: chiave,
            p_brand_id: seq.brand_id,
            p_durata_gg: 25,
          });
          const riga = Array.isArray(esito) ? esito[0] : esito;
          ok = !!riga?.ok;
          esitoPerAzienda.set(chiave, ok);
          if (!ok) {
            const motivo = String(riga?.motivo ?? "sconosciuto").split(":")[0];
            stats.lock_negato_per_motivo[motivo] = (stats.lock_negato_per_motivo[motivo] ?? 0) + 1;
          }
        }
        if (ok) conLock.push(c); else stats.skipped_lock++;
      }
    }
    if (conLock.length === 0) {
      return jsonResponse({ ...stats, note: "Tutti i contatti sono bloccati dal lock multi-brand: queste aziende sono già lavorate da un altro brand o in cooldown." }, 200, corsH);
    }
    eligible.length = 0;
    eligible.push(...conLock);

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
    const orari = spreadFirstTouch({ start: inizio, count: eligible.length, capPerDay: capPool });
    const scheduleByContact = new Map<string, string>(eligible.map((c: { id: string }, i: number) => [c.id, orari[i].toISOString()]));
    const schedule = inizio.toISOString();
    const CHUNK = 200;
    for (let i = 0; i < eligible.length; i += CHUNK) {
      const slice = eligible.slice(i, i + CHUNK);
      const enrRows = slice.map((c) => ({
        company_id: PLATFORM_COMPANY,
        sequence_id: sequenceId,
        contact_id: c.id,
        status: "active",
        current_step: first.step_order,
        next_action_at: scheduleByContact.get(c.id) ?? schedule,
      }));
      const { data: enr, error: enrErr } = await admin
        .from("outreach_enrollments").insert(enrRows).select("id,contact_id");
      if (enrErr) throw enrErr;
      const emailByContact = new Map(slice.map((c) => [c.id, c.email]));
      const queueRows = (enr ?? []).map((row: { id: string; contact_id: string }) => {
        return {
          company_id: PLATFORM_COMPANY,
          enrollment_id: row.id,
          contact_id: row.contact_id,
          brand_id: seq.brand_id ?? null,
          channel: "email",
          to_email: emailByContact.get(row.contact_id) ?? null,
          subject: first.subject ?? "",
          body: first.body ?? "",
          status: "queued",
          scheduled_for: scheduleByContact.get(row.contact_id) ?? schedule,
          // È il primo touch: conta nel tetto «nuovi al giorno» del brand.
          primo_contatto: true,
        };
      });
      if (queueRows.length) {
        const { error: qErr } = await admin.from("outreach_send_queue").insert(queueRows);
        if (qErr) throw qErr;
      }
      // Contact Lock (L1): da adesso questi contatti risultano in sequenza per
      // questo brand, e un brand diverso li trovera' occupati.
      if (seq.brand_id && enr?.length) {
        await admin.rpc("outreach_marca_in_sequenza", {
          p_contact_ids: enr.map((r: { contact_id: string }) => r.contact_id),
          p_brand_id: seq.brand_id,
        });
      }
      stats.enrolled += enr?.length ?? 0;
    }

    // 6. se la sequenza era in bozza, attivala (sta per partire davvero)
    if (seq.status === "draft" && stats.enrolled > 0) {
      await admin.from("outreach_sequences").update({ status: "active" }).eq("id", sequenceId);
    }

    return jsonResponse({ ...stats, scheduled_for: schedule }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-enroll error:", e);
    return errorResponse("Errore durante l'iscrizione alla sequenza", 500, corsH);
  }
});
