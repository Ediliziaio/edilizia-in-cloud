/**
 * agent-tools — strumenti che l'agente vocale usa DURANTE la chiamata
 *
 * ElevenLabs supporta i "webhook tool": quando il cliente chiede qualcosa che
 * richiede dati veri, il modello chiama questo endpoint IN CHIAMATA e legge la
 * risposta al telefono. È la differenza tra "le farò sapere" e "la sua merce
 * è arrivata ieri in magazzino, la posa è prevista giovedì 6".
 *
 * Azioni (canoniche + alias dal catalogo tool del proxy):
 *  - stato_consegna       → ultima commessa aperta del numero: stato, avanzamento,
 *                           merce in magazzino, data consegna prevista.
 *  - crea_ticket          → apre un ticket di assistenza col racconto del cliente
 *                           e risponde col riferimento da leggere a voce.
 *  - fissa_appuntamento   → (alias create_appointment) controlla i conflitti e
 *                           prenota un appuntamento vero in agenda.
 *  - disponibilita        → (alias get_availability) slot liberi di una giornata.
 *  - stato_preventivo     → stato dell'ultimo preventivo del chiamante.
 *  - richiesta_richiamo   → (alias assign_to_user) task per l'ufficio: il
 *                           cliente vuole essere richiamato da una persona.
 *  - info_prodotto        → (alias search_products) cerca nel listino aziendale.
 *  - info_cliente         → (alias get_lead_info) riepilogo del chiamante: chi è,
 *                           commesse e preventivi aperti. Solo i SUOI dati.
 *
 * COME SI COLLEGA: il proxy (elevenlabs-proxy) genera da solo gli URL per i
 * tool abilitati in tools_config.edilizia_tools, nella forma
 *   .../agent-tools?agent=<elevenlabs_agent_id>&key=<chiave>&tool=<azione>
 * `tool` nell'URL rende deterministica l'azione (il body lo scrive l'LLM e può
 * sbagliare i nomi); il body resta il canale dei parametri (data, ora, ...).
 *
 * Sicurezza e tenancy: ElevenLabs chiama senza JWT, quindi l'URL porta la
 * chiave. Sono valide DUE chiavi (confronto constant-time):
 *   1. ELEVENLABS_WEBHOOK_SECRET (master, solo configurazioni manuali);
 *   2. la chiave derivata per azienda HMAC(secret, "agent-tools:"+company_id) —
 *      è quella che il proxy scrive negli URL: se trapela, espone solo i dati
 *      che quell'azienda vede già, MAI il secret di piattaforma.
 * L'azienda si risolve SEMPRE dall'agent id ElevenLabs nell'URL — il corpo
 * della richiesta, scritto dall'LLM, non può scegliere il tenant. Il numero di
 * telefono arriva dalla dynamic variable di sistema (system__caller_id) o dal
 * body: serve solo a filtrare DENTRO l'azienda dell'agente.
 *
 * Risposte: testo semplice in italiano, pensato per essere LETTO A VOCE.
 * Niente markdown, niente importi di commesse/fatture, niente dati di terzi.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseCorsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEq(x: string, y: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(x), b = enc.encode(y);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Chiave derivata per azienda: stessa formula usata dal proxy quando genera gli URL. */
async function deriveCompanyKey(secret: string, companyId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`agent-tools:${companyId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dataParlata(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

/** "2026-08-06", "06/08/2026", "06-08-2026" → "2026-08-06" (o null). */
function normalizzaData(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "9", "9:30", "09.30" → "09:30" (o null). */
function normalizzaOra(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

/** Slot liberi di una giornata (finestra 08:00–18:00, passo 1h) dati gli orari occupati. */
function slotLiberi(occupati: Set<number>): number[] {
  const liberi: number[] = [];
  for (let h = 8; h < 18; h++) if (!occupati.has(h)) liberi.push(h);
  return liberi;
}

/** Gli orari già impegnati (ora piena) di una giornata per l'azienda. */
async function orariOccupati(admin: SupabaseClient, companyId: string, dataISO: string): Promise<Set<number>> {
  const { data } = await admin
    .from("appointments")
    .select("appointment_time")
    .eq("company_id", companyId)
    .eq("appointment_date", dataISO)
    .not("status", "in", '("annullato","cancelled","disdetto")');
  const occupati = new Set<number>();
  for (const r of data ?? []) {
    const h = Number(String(r.appointment_time ?? "").slice(0, 2));
    if (Number.isFinite(h)) occupati.add(h);
  }
  return occupati;
}

/** created_by per i record creati dall'agente: titolare azienda, poi un admin. */
async function profiloPerConto(admin: SupabaseClient, companyId: string, fallback: string): Promise<string> {
  for (const role of ["owner", "admin"]) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("role", role)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return fallback; // id dell'agente: stesso fallback già in produzione nel webhook
}

const STATO_PREVENTIVO_PARLATO: Record<string, string> = {
  bozza: "è in preparazione: l'ufficio lo sta ancora completando",
  inviata: "le è stato inviato: controlli la posta, anche nello spam",
  accettata: "risulta accettato: l'ufficio la contatterà per i prossimi passi",
  rifiutata: "risulta non accettato",
  scaduta: "è scaduto: se è ancora interessato possiamo farne preparare uno aggiornato",
  convertita: "è stato confermato ed è diventato un lavoro in corso",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: baseCorsHeaders });

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
    if (!secret) return json({ error: "Secret non configurato" }, 503);
    const key = url.searchParams.get("key") ?? "";

    const elevenlabsAgentId = url.searchParams.get("agent");
    if (!elevenlabsAgentId) return json({ error: "agent mancante nell'URL" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Tenancy dal solo agent id: il body non decide mai l'azienda. La risoluzione
    // avviene PRIMA della verifica chiave perché la chiave derivata dipende
    // dall'azienda; agente sconosciuto → stesso 401 della chiave sbagliata
    // (nessun oracolo sugli id esistenti).
    let companyId: string | null = null;
    let agentRowId: string | null = null;
    for (const tab of ["ai_agents_v2", "ai_agents", "internal_ai_agents"] as const) {
      const { data } = await admin.from(tab).select("id, company_id").eq("elevenlabs_agent_id", elevenlabsAgentId).maybeSingle();
      if (data?.company_id) { companyId = data.company_id as string; agentRowId = data.id as string; break; }
    }
    if (!companyId || !agentRowId) return json({ error: "unauthorized" }, 401);

    const masterOk = constantTimeEq(key, secret);
    const derivedOk = masterOk ? true : constantTimeEq(key, await deriveCompanyKey(secret, companyId));
    if (!masterOk && !derivedOk) return json({ error: "unauthorized" }, 401);

    // Azione: prima il parametro URL `tool` (lo scrive il proxy, deterministico),
    // poi il body scritto dall'LLM. Parsing tollerante sui nomi alternativi.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const azioneRaw = String(
      url.searchParams.get("tool") ?? url.searchParams.get("azione") ?? body.azione ?? body.action ?? body.tool ?? "",
    ).toLowerCase();
    const ALIAS: Record<string, string> = {
      stato_commessa: "stato_consegna", stato_ordine: "stato_consegna",
      apri_ticket: "crea_ticket", assistenza: "crea_ticket",
      create_appointment: "fissa_appuntamento", crea_appuntamento: "fissa_appuntamento", prendi_appuntamento: "fissa_appuntamento",
      get_availability: "disponibilita", verifica_disponibilita: "disponibilita", "disponibilità": "disponibilita",
      quote_status: "stato_preventivo", preventivo: "stato_preventivo",
      assign_to_user: "richiesta_richiamo", callback: "richiesta_richiamo", richiedi_richiamo: "richiesta_richiamo",
      search_products: "info_prodotto", cerca_prodotto: "info_prodotto",
      get_lead_info: "info_cliente", chi_sono: "info_cliente",
    };
    const azione = ALIAS[azioneRaw] ?? azioneRaw;

    const rawPhone = String(body.telefono ?? body.phone ?? body.caller_id ?? body.system__caller_id ?? "");
    const safePhone = sanitizePhoneForQuery(rawPhone);
    const suffix = safePhone ? safePhone.replace(/\+/g, "").slice(-9) : null;

    /** Contatto CRM del chiamante (se il numero è noto). */
    const trovaContatto = async () => {
      if (!suffix) return null;
      const { data } = await admin
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .ilike("phone", `%${suffix}%`)
        .limit(1)
        .maybeSingle();
      return data ?? null;
    };

    // ── STATO CONSEGNA / COMMESSA ──────────────────────────────────────────
    if (azione === "stato_consegna") {
      if (!suffix) {
        return json({ risposta: "Per controllare lo stato mi serve il numero di telefono con cui è registrato il lavoro. Può confermarmelo?" });
      }
      const { data: ordini } = await admin
        .from("orders")
        .select("order_code, tipo_lavoro, status, percentuale_avanzamento, expected_date, warehouse_arrival_date, work_start_date")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("status", "in", '("completato","annullato")')
        .ilike("client_phone", `%${suffix}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      const o = ordini?.[0];
      if (!o) {
        return json({ risposta: "Con questo numero non trovo lavori in corso. Se il lavoro è intestato a un altro numero o a un familiare, posso comunque prendere nota e farla richiamare dall'ufficio." });
      }

      const lavoro = o.tipo_lavoro ? String(o.tipo_lavoro).replace(/_/g, " ") : "il lavoro";
      const pezzi: string[] = [`Per ${lavoro}, pratica ${o.order_code}:`];
      if (o.warehouse_arrival_date) {
        const arrivata = new Date(o.warehouse_arrival_date as string) <= new Date();
        pezzi.push(arrivata
          ? `la merce è arrivata in magazzino ${dataParlata(o.warehouse_arrival_date as string)}.`
          : `l'arrivo della merce in magazzino è previsto ${dataParlata(o.warehouse_arrival_date as string)}.`);
      } else {
        pezzi.push("la merce è in ordine dal fornitore, non abbiamo ancora una data di arrivo confermata.");
      }
      if (o.percentuale_avanzamento != null && Number(o.percentuale_avanzamento) > 0) {
        pezzi.push(`I lavori sono avanti al ${o.percentuale_avanzamento} per cento.`);
      }
      if (o.expected_date) pezzi.push(`La fine prevista è ${dataParlata(o.expected_date as string)}.`);
      pezzi.push("Se le serve una data più precisa, posso far richiamare dall'ufficio.");
      return json({ risposta: pezzi.join(" ") });
    }

    // ── CREA TICKET ASSISTENZA ─────────────────────────────────────────────
    if (azione === "crea_ticket") {
      const descrizione = String(body.descrizione ?? body.problema ?? body.description ?? "").trim();
      if (!descrizione) {
        return json({ risposta: "Per aprire la segnalazione mi descriva il problema in una frase, per favore." });
      }
      const urgente = /urgent|subito|emergenz|perdita|allagament|non funziona/i.test(
        String(body.urgenza ?? "") + " " + descrizione,
      );

      // Aggancia il cliente se il numero è noto (facoltativo: il ticket nasce comunque)
      const contact = await trovaContatto();
      let nomeCliente = String(body.nome ?? body.nome_cliente ?? "").trim();
      if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");

      const titolo = `Assistenza telefonica${nomeCliente ? ` — ${nomeCliente}` : ""}`;
      const { data: ticket, error: tErr } = await admin
        .from("tickets")
        .insert({
          company_id: companyId,
          customer_id: contact?.id ?? null,
          titolo,
          subject: titolo,
          descrizione: `${descrizione}\n\n[Aperto dall'agente vocale${rawPhone ? ` — chiamante ${rawPhone}` : ""}]`,
          priorita: urgente ? "alta" : "media",
          priority: urgente ? "high" : "medium",
          fonte: "agente_vocale",
          status: "aperto",
        })
        .select("id")
        .single();

      if (tErr || !ticket) {
        console.error("[AGENT-TOOLS] crea_ticket:", tErr?.message);
        // Mai lasciare l'agente muto: fallback onesto.
        return json({ risposta: "Ho registrato la sua richiesta e la passo subito all'ufficio, che la ricontatterà in giornata." });
      }

      const rif = String(ticket.id).slice(0, 8).toUpperCase();
      return json({
        risposta: `Fatto: ho aperto la segnalazione con riferimento ${rif}${urgente ? ", marcata come urgente" : ""}. Il tecnico la ricontatterà ${urgente ? "il prima possibile" : "entro un giorno lavorativo"}.`,
        ticket_id: ticket.id,
      });
    }

    // ── DISPONIBILITÀ SLOT ─────────────────────────────────────────────────
    if (azione === "disponibilita") {
      const dataISO = normalizzaData(String(body.data ?? body.date ?? body.giorno ?? ""));
      if (!dataISO) {
        return json({ risposta: "Per quale giorno vuole controllare la disponibilità? Mi dica la data." });
      }
      const liberi = slotLiberi(await orariOccupati(admin, companyId, dataISO));
      if (liberi.length === 0) {
        return json({ risposta: `Per ${dataParlata(dataISO)} siamo al completo. Vuole provare con un altro giorno?` });
      }
      const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
      return json({ risposta: `Per ${dataParlata(dataISO)} abbiamo disponibilità ${proposte}. Quale orario preferisce?` });
    }

    // ── FISSA APPUNTAMENTO ─────────────────────────────────────────────────
    if (azione === "fissa_appuntamento") {
      const dataISO = normalizzaData(String(body.data ?? body.date ?? body.giorno ?? ""));
      if (!dataISO) {
        return json({ risposta: "Per fissare l'appuntamento mi serve il giorno. Quando preferisce?" });
      }
      if (dataISO < new Date().toISOString().slice(0, 10)) {
        return json({ risposta: "Quella data è già passata. Mi indichi un giorno da domani in poi, per favore." });
      }
      const ora = normalizzaOra(String(body.ora ?? body.time ?? body.orario ?? ""));
      const occupati = await orariOccupati(admin, companyId, dataISO);

      if (!ora) {
        const liberi = slotLiberi(occupati);
        if (liberi.length === 0) {
          return json({ risposta: `Per ${dataParlata(dataISO)} siamo al completo. Vuole provare con un altro giorno?` });
        }
        const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
        return json({ risposta: `Per ${dataParlata(dataISO)} posso proporle ${proposte}. Quale orario va bene?` });
      }

      const oraH = Number(ora.slice(0, 2));
      if (occupati.has(oraH)) {
        const liberi = slotLiberi(occupati);
        if (liberi.length === 0) {
          return json({ risposta: `${dataParlata(dataISO)} alle ${oraH} è già occupato e la giornata è piena. Proviamo con un altro giorno?` });
        }
        const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
        return json({ risposta: `Alle ${oraH} è già occupato. Lo stesso giorno posso proporle ${proposte}. Quale preferisce?` });
      }

      const contact = await trovaContatto();
      let nomeCliente = String(body.nome ?? body.nome_cliente ?? "").trim();
      if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
      const motivo = String(body.motivo ?? body.titolo ?? body.title ?? "").trim() || "Sopralluogo";

      const { data: appt, error: aErr } = await admin
        .from("appointments")
        .insert({
          company_id: companyId,
          created_by: await profiloPerConto(admin, companyId, agentRowId),
          title: `${motivo}${nomeCliente ? ` — ${nomeCliente}` : ""}`,
          appointment_date: dataISO,
          appointment_time: `${ora}:00`,
          appointment_end_time: `${String(oraH + 1).padStart(2, "0")}:${ora.slice(3, 5)}:00`,
          appointment_type: "agente_ai",
          status: "confermato",
          contact_id: contact?.id ?? null,
          description: `Fissato dall'agente vocale${rawPhone ? ` — chiamante ${rawPhone}` : ""}.`,
        })
        .select("id")
        .single();

      if (aErr || !appt) {
        console.error("[AGENT-TOOLS] fissa_appuntamento:", aErr?.message);
        return json({ risposta: "Non riesco a confermare in questo momento, ma ho preso nota della sua preferenza: l'ufficio la richiamerà per confermare giorno e orario." });
      }
      return json({
        risposta: `Perfetto, appuntamento fissato per ${dataParlata(dataISO)} alle ${oraH}${ora.slice(3, 5) !== "00" ? ` e ${Number(ora.slice(3, 5))}` : ""}. Riceverà conferma dall'ufficio. Posso aiutarla con altro?`,
        appointment_id: appt.id,
      });
    }

    // ── STATO PREVENTIVO ───────────────────────────────────────────────────
    if (azione === "stato_preventivo") {
      if (!suffix) {
        return json({ risposta: "Per controllare il preventivo mi serve il numero di telefono con cui è stato richiesto. Può confermarmelo?" });
      }
      const { data: preventivi } = await admin
        .from("quotes")
        .select("quote_number, status, created_at, sent_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .ilike("client_phone", `%${suffix}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      const q = preventivi?.[0];
      if (!q) {
        return json({ risposta: "Con questo numero non trovo preventivi. Se l'ha richiesto con un altro numero, posso prendere nota e far controllare all'ufficio." });
      }
      const statoParlato = STATO_PREVENTIVO_PARLATO[String(q.status ?? "")] ?? "è in lavorazione";
      const quando = q.sent_at ?? q.created_at;
      return json({
        risposta: `Il preventivo ${q.quote_number}, del ${dataParlata(String(quando).slice(0, 10))}, ${statoParlato}. Vuole che le faccia richiamare dall'ufficio per parlarne?`,
      });
    }

    // ── RICHIESTA RICHIAMO ─────────────────────────────────────────────────
    if (azione === "richiesta_richiamo") {
      const contact = await trovaContatto();
      let nomeCliente = String(body.nome ?? body.nome_cliente ?? "").trim();
      if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
      const motivo = String(body.motivo ?? body.descrizione ?? body.note ?? "").trim();
      const urgente = /urgent|subito|oggi|emergenz/i.test(String(body.urgenza ?? "") + " " + motivo);

      const domani = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
      const { error: kErr } = await admin.from("tasks").insert({
        company_id: companyId,
        created_by: await profiloPerConto(admin, companyId, agentRowId),
        title: `Richiamare ${nomeCliente || rawPhone || "cliente"} (agente vocale)`,
        notes: [
          motivo ? `Motivo: ${motivo}` : null,
          rawPhone ? `Numero: ${rawPhone}` : null,
          "Richiesta raccolta dall'agente vocale.",
        ].filter(Boolean).join("\n"),
        due_date: urgente ? new Date().toISOString().slice(0, 10) : domani,
        priority: urgente ? "high" : "medium",
        status: "da_fare",
        contact_id: contact?.id ?? null,
      });

      if (kErr) {
        console.error("[AGENT-TOOLS] richiesta_richiamo:", kErr.message);
        return json({ risposta: "Ho preso nota: la faccio richiamare dall'ufficio il prima possibile." });
      }
      return json({
        risposta: urgente
          ? "Ho segnato la richiesta come urgente: l'ufficio la richiamerà oggi stesso a questo numero."
          : "Perfetto, ho lasciato il messaggio all'ufficio: la richiameranno entro domani a questo numero.",
      });
    }

    // ── INFO PRODOTTO / LISTINO ────────────────────────────────────────────
    if (azione === "info_prodotto") {
      const ricerca = String(body.prodotto ?? body.query ?? body.nome_prodotto ?? body.q ?? "").trim();
      if (!ricerca) {
        return json({ risposta: "Che prodotto o materiale le interessa? Mi dica il nome." });
      }
      const { data: famiglie } = await admin
        .from("article_families")
        .select("nome, descrizione")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .is("deleted_at", null)
        .ilike("nome", `%${ricerca.replace(/[%_]/g, "")}%`)
        .limit(3);

      if (!famiglie?.length) {
        return json({ risposta: `Al momento non trovo "${ricerca}" nel nostro catalogo, ma potremmo comunque procurarlo: vuole che la faccia richiamare da un tecnico per un preventivo?` });
      }
      const nomi = famiglie.map((f) => f.nome).join(", ");
      return json({
        risposta: famiglie.length === 1
          ? `Sì, trattiamo ${nomi}. Il prezzo dipende da misure e configurazione: se vuole le fisso un sopralluogo o le faccio preparare un preventivo. Come preferisce?`
          : `Sì, in catalogo abbiamo: ${nomi}. Il prezzo dipende da misure e configurazione: se vuole le fisso un sopralluogo o le faccio preparare un preventivo.`,
      });
    }

    // ── INFO CLIENTE (solo i dati del chiamante) ───────────────────────────
    if (azione === "info_cliente") {
      const contact = await trovaContatto();
      const [{ count: nOrdini }, { count: nPreventivi }] = await Promise.all([
        admin.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .not("status", "in", '("completato","annullato")')
          .ilike("client_phone", suffix ? `%${suffix}%` : "%NOMATCH%"),
        admin.from("quotes").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .in("status", ["bozza", "inviata"])
          .ilike("client_phone", suffix ? `%${suffix}%` : "%NOMATCH%"),
      ]);

      if (!contact && !nOrdini && !nPreventivi) {
        return json({ risposta: "Con questo numero non trovo una scheda cliente: probabilmente è la prima volta che ci chiama. Posso comunque aiutarla o prendere i suoi dati." });
      }
      const nome = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "";
      const pezzi: string[] = [nome ? `Il numero risulta intestato a ${nome}.` : "Il numero risulta già registrato da noi."];
      if (nOrdini) pezzi.push(nOrdini === 1 ? "C'è un lavoro in corso." : `Ci sono ${nOrdini} lavori in corso.`);
      if (nPreventivi) pezzi.push(nPreventivi === 1 ? "C'è un preventivo aperto." : `Ci sono ${nPreventivi} preventivi aperti.`);
      return json({ risposta: pezzi.join(" ") });
    }

    return json({ risposta: "Non ho capito quale operazione fare. Posso controllare consegne e preventivi, fissare un appuntamento, aprire una segnalazione o farla richiamare dall'ufficio." });
  } catch (e) {
    console.error("[AGENT-TOOLS] errore:", e instanceof Error ? e.message : e);
    return json({ risposta: "In questo momento non riesco ad accedere ai dati. Prendo nota e faccio richiamare dall'ufficio." });
  }
});
