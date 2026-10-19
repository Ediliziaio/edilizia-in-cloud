// bot-routine-dispatch — le automazioni del bot operativo che partono da sole
// (28/09/2026). Gira ogni 15 minuti (pg_cron): report del mattino, cose del
// giorno agli operai, avvisi, promemoria appuntamenti, rapportino della sera.
// Legge bot_routine, per ogni routine dovuta manda il messaggio ai destinatari
// via whatsapp-send (testo se la finestra 24h è aperta, altrimenti il modello
// Meta), e logga in wa_operational_reminder_log per non ripetere.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { oraItalianaParti, routineDovutaOra, testoPerModello } from "../_shared/routineOperativa.ts";
import { componiReportMattino, type DatiReport } from "../_shared/reportMattino.ts";
import { componiTodoOperaio, copertiDaRapportini, type CantiereTodo } from "../_shared/todoOperaio.ts";
import { componiAvvisi, type DatiAvvisi } from "../_shared/avvisiOperativi.ts";
import { appuntamentiImminenti, type AppuntamentoRow, componiPromemoriaAppuntamento } from "../_shared/promemoriaAppuntamento.ts";
import { messaggioProattivoAI } from "../_shared/messaggioProattivoAI.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { commessaAperta } from "../whatsapp-ai-processor/tools/shared/cantieriAperti.ts";

/** L'AqI scrive il messaggio, se non è stata disattivata nella routine. */
function usaAI(r: RoutineRow): boolean {
  return r.regole?.ai !== false;
}

interface Esito { sent: number; skipped: number; failed: number; }
/** Prova senza effetti: anteprima (nessun invio) o invio a un solo numero. */
interface Prova { anteprima: boolean; soloTelefono: string | null; messaggi: Array<{ a: string; nome: string | null; testo: string }> }
const vuoto = (): Esito => ({ sent: 0, skipped: 0, failed: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

interface RoutineRow {
  id: string;
  company_id: string;
  wa_number_id: string;
  ora: string | null;
  giorni: number[] | null;
  destinatari: { utenti?: string[]; ruoli?: string[] } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  regole: Record<string, any> | null;
  template_nome: string | null;
}

function cleanPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^0-9]/g, "");
  if (d.length < 9) return null;
  return d.startsWith("39") ? d : `39${d}`;
}

function dataOggiRoma(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function risolviDestinatari(supabase: DB, companyId: string, dest: RoutineRow["destinatari"]): Promise<Array<{ userId: string; phone: string }>> {
  const out = new Map<string, string>();
  const aggiungi = (userId: string | null, phone: string | null) => {
    const p = cleanPhone(phone);
    if (userId && p && !out.has(userId)) out.set(userId, p);
  };
  const utenti = Array.isArray(dest?.utenti) ? dest!.utenti : [];
  if (utenti.length > 0) {
    const { data } = await supabase.from("profiles").select("id, phone").in("id", utenti).eq("company_id", companyId);
    for (const r of data ?? []) aggiungi(r.id, r.phone);
  }
  const ruoli = Array.isArray(dest?.ruoli) ? dest!.ruoli : [];
  if (ruoli.includes("admin")) {
    // In due passi: user_roles punta ad auth.users, non a profiles, e una lettura
    // unita delle due tabelle risponde sempre con un errore. Prima i responsabili
    // (poche decine in tutto), poi chi di loro è di questa azienda.
    const { data: responsabili } = await supabase.from("user_roles").select("user_id")
      .in("role", ["company_admin", "super_admin"]);
    const ids = ((responsabili ?? []) as Array<{ user_id: string }>).map((x) => x.user_id);
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, phone").eq("company_id", companyId).in("id", ids);
      for (const r of data ?? []) aggiungi(r.id, r.phone);
    }
  }
  return [...out.entries()].map(([userId, phone]) => ({ userId, phone }));
}

async function invia(
  supabase: DB,
  waNumberId: string,
  companyId: string,
  phone: string,
  testo: string,
  templateNome: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const intest = { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` };
  const testoRes = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: intest,
    body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to: phone, text: testo }),
  });
  if (testoRes.ok) return { ok: true };
  const j = await testoRes.json().catch(() => null) as { code?: string } | null;
  // Fuori dalla finestra 24h: serve il modello approvato.
  if (j?.code === "window_closed" && templateNome) {
    const modRes = await fetch(`${base}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: intest,
      body: JSON.stringify({
        wa_number_id: waNumberId,
        company_id: companyId,
        to: phone,
        type: "template",
        // Meta rifiuta i parametri con a capo, tabulazioni o più di 4 spazi di fila
        // (errore #132018): il testo va su una riga sola. Prima ogni invio fuori
        // dalla finestra delle 24 ore falliva così.
        template: { name: templateNome, language: "it", variables: { "1": testoPerModello(testo) } },
      }),
    });
    if (modRes.ok) return { ok: true };
    return { ok: false, detail: (await modRes.text()).slice(0, 400) };
  }
  return { ok: false, detail: (await testoRes.text()).slice(0, 400) };
}

/** Un messaggio già mandato oggi a questa persona per questo tipo? (anti-ripetizione) */
async function giaMandato(supabase: DB, companyId: string, oggi: string, kind: string, userId: string | null, phone?: string): Promise<boolean> {
  let q = supabase.from("wa_operational_reminder_log").select("id")
    .eq("company_id", companyId).eq("reminder_date", oggi).eq("reminder_kind", kind).eq("status", "sent");
  // Chi non ha l'account si riconosce dal telefono.
  q = userId ? q.eq("employee_user_id", userId) : q.is("employee_user_id", null).eq("phone", phone ?? "");
  const { data } = await q.limit(1).maybeSingle();
  return !!data;
}

async function logga(supabase: DB, r: RoutineRow, oggi: string, kind: string, userId: string | null, phone: string, esito: { ok: boolean; detail?: string }) {
  await supabase.from("wa_operational_reminder_log").insert({
    company_id: r.company_id, wa_number_id: r.wa_number_id, employee_user_id: userId,
    reminder_date: oggi, reminder_kind: kind, phone,
    status: esito.ok ? "sent" : "failed", error_detail: esito.ok ? null : esito.detail ?? null,
    sent_at: esito.ok ? new Date().toISOString() : null,
  });
}

async function eseguiReportMattino(supabase: DB, r: RoutineRow, now: Date, oggi: string, force: boolean): Promise<Esito> {
  const e = vuoto();
  const destinatari = await risolviDestinatari(supabase, r.company_id, r.destinatari);
  if (destinatari.length === 0) { e.skipped++; return e; }
  const { data: comp } = await supabase.from("companies").select("name").eq("id", r.company_id).maybeSingle();
  const { data: dati } = await supabase.rpc("bot_report_mattino_dati", { p_company_id: r.company_id });
  let testo = componiReportMattino(comp?.name ?? null, (dati ?? {}) as DatiReport, now);
  if (usaAI(r)) {
    testo = await messaggioProattivoAI({
      supabase,
      taskKey: "bot_operativo_titolare",
      companyId: r.company_id,
      istruzioni: "È il riepilogo del mattino per il titolare. Metti in cima le cose che chiedono un'azione oggi (incassi in ritardo, materiale sotto scorta, preventivi da ricontattare). Se ci sono appuntamenti, elencali con l'ora. Chiudi con una sola riga sulla priorità del giorno. Massimo 8-9 righe.",
      dati: dati ?? {},
      testoBase: testo,
      maxTokens: 700,
    });
  }
  for (const { userId, phone } of destinatari) {
    if (!force && await giaMandato(supabase, r.company_id, oggi, "report_mattino", userId)) { e.skipped++; continue; }
    const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
    await logga(supabase, r, oggi, "report_mattino", userId, phone, esito);
    esito.ok ? e.sent++ : e.failed++;
  }
  return e;
}

interface OrdineInfo { titolo: string; indirizzo: string | null; descrizione: string | null; }


/**
 * Le cose del giorno per ogni operaio (18/10/2026). Dove va: i cantieri delle
 * SUE fasi di oggi (squadra della fase, con le date della fase) e le
 * assegnazioni dirette con le date di oggi. Cosa fa: le fasi del giorno e le
 * sue attività in scadenza. Con chi: chi è sulle stesse fasi oggi. Vale anche
 * per chi non ha l'account nell'app (è in anagrafica col telefono). Prima
 * leggeva solo le assegnazioni dirette e saltava chi non aveva l'account:
 * quasi nessuno riceveva il messaggio.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dipendente = any;
interface PianoDelGiorno {
  /** dipendente → cantiere → fasi di oggi */
  lavoro: Map<string, Map<string, Set<string>>>;
  empById: Map<string, Dipendente>;
  empByUser: Map<string, Dipendente>;
  infoOrdine: Map<string, OrdineInfo>;
  chiSuOrdine: Map<string, Set<string>>;
}

/** Chi lavora dove oggi, e su quali fasi: la stessa pianificazione per il mattino e per la sera. */
async function pianoDelGiorno(supabase: DB, r: RoutineRow, oggi: string): Promise<PianoDelGiorno> {
  // Fasi di oggi, con la squadra della fase.
  const { data: fasiOggi } = await supabase.from("order_work_phases")
    .select("id, name, order_id, position, start_date, end_date, status")
    .eq("company_id", r.company_id).lte("start_date", oggi)
    .or(`end_date.is.null,end_date.gte.${oggi}`).neq("status", "completata").limit(500);
  const fasi = ((fasiOggi ?? []) as Array<{ id: string; name: string; order_id: string; position: number | null }>);
  const faseById = new Map(fasi.map((f) => [f.id, f]));
  // A lotti di 100: con centinaia di fasi l'indirizzo della lettura diventa troppo lungo.
  const squadraFasi: Array<{ employee_id: string; order_id: string; phase_id: string }> = [];
  for (let i = 0; i < fasi.length; i += 100) {
    const { data } = await supabase.from("order_employees").select("employee_id, order_id, phase_id")
      .in("phase_id", fasi.slice(i, i + 100).map((f) => f.id));
    squadraFasi.push(...((data ?? []) as typeof squadraFasi));
  }
  // Assegnazioni dirette con le date di oggi.
  const { data: dirette } = await supabase.from("order_campo_assignments")
    .select("user_id, order_id, data_inizio, data_fine_prevista")
    .eq("company_id", r.company_id)
    .or(`data_inizio.is.null,data_inizio.lte.${oggi}`)
    .or(`data_fine_prevista.is.null,data_fine_prevista.gte.${oggi}`);

  const { data: dipendenti } = await supabase.from("employees")
    .select("id, user_id, first_name, last_name, phone, phone_whatsapp, is_active")
    .eq("company_id", r.company_id).eq("is_active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = ((dipendenti ?? []) as any[]);
  const empById = new Map(emp.map((x) => [x.id, x]));
  const empByUser = new Map(emp.filter((x) => x.user_id).map((x) => [x.user_id, x]));

  // Per ogni dipendente: cantiere → fasi di oggi.
  const lavoro = new Map<string, Map<string, Set<string>>>();
  const segna = (empId: string, orderId: string, fase?: string) => {
    if (!lavoro.has(empId)) lavoro.set(empId, new Map());
    const perOrdine = lavoro.get(empId)!;
    if (!perOrdine.has(orderId)) perOrdine.set(orderId, new Set());
    if (fase) perOrdine.get(orderId)!.add(fase);
  };
  for (const s of squadraFasi) {
    const f = faseById.get(s.phase_id);
    if (f && empById.has(s.employee_id)) segna(s.employee_id, f.order_id, f.name);
  }
  for (const a of (dirette ?? []) as Array<{ user_id: string | null; order_id: string | null }>) {
    const x = a.user_id ? empByUser.get(a.user_id) : null;
    if (x && a.order_id) segna(x.id, a.order_id);
  }
  // Squadre interne mandate sulla commessa con le date di oggi: i componenti
  // (e il caposquadra) lavorano lì, sulla fase della squadra o su quelle del giorno.
  const { data: squadreOggi } = await supabase.from("squadre_commesse")
    .select("squadra_id, order_id, phase_id, dal, al")
    .eq("company_id", r.company_id)
    .or(`dal.is.null,dal.lte.${oggi}`).or(`al.is.null,al.gte.${oggi}`);
  const squadre = (squadreOggi ?? []) as Array<{ squadra_id: string; order_id: string; phase_id: string | null }>;
  if (squadre.length > 0) {
    const ids = [...new Set(squadre.map((q) => q.squadra_id))];
    const [{ data: componenti }, { data: team }] = await Promise.all([
      supabase.from("squadre_componenti").select("squadra_id, hr_profilo_id").in("squadra_id", ids),
      supabase.from("external_teams").select("id, responsabile_hr_profilo_id, is_active, kind").in("id", ids),
    ]);
    const profiliPerSquadra = new Map<string, Set<string>>();
    for (const c of (componenti ?? []) as Array<{ squadra_id: string; hr_profilo_id: string }>) {
      if (!profiliPerSquadra.has(c.squadra_id)) profiliPerSquadra.set(c.squadra_id, new Set());
      profiliPerSquadra.get(c.squadra_id)!.add(c.hr_profilo_id);
    }
    for (const t of (team ?? []) as Array<{ id: string; responsabile_hr_profilo_id: string | null; is_active: boolean; kind: string | null }>) {
      if (!t.is_active || t.kind !== "interna") { profiliPerSquadra.delete(t.id); continue; }
      if (t.responsabile_hr_profilo_id) {
        if (!profiliPerSquadra.has(t.id)) profiliPerSquadra.set(t.id, new Set());
        profiliPerSquadra.get(t.id)!.add(t.responsabile_hr_profilo_id);
      }
    }
    const tuttiProfili = [...new Set([...profiliPerSquadra.values()].flatMap((x) => [...x]))];
    const { data: profili } = tuttiProfili.length
      ? await supabase.from("hr_profili").select("id, employee_id").eq("company_id", r.company_id).in("id", tuttiProfili)
      : { data: [] };
    const empPerProfilo = new Map(((profili ?? []) as Array<{ id: string; employee_id: string | null }>).map((p) => [p.id, p.employee_id]));
    for (const q of squadre) {
      const nomeFase = q.phase_id ? faseById.get(q.phase_id)?.name : undefined;
      const fasiDelGiorno = nomeFase ? [nomeFase] : fasi.filter((f) => f.order_id === q.order_id).map((f) => f.name);
      for (const prof of profiliPerSquadra.get(q.squadra_id) ?? []) {
        const empId = empPerProfilo.get(prof);
        if (!empId || !empById.has(empId)) continue;
        if (fasiDelGiorno.length === 0) segna(empId, q.order_id);
        for (const nome of fasiDelGiorno) segna(empId, q.order_id, nome);
      }
    }
  }

  // I cantieri: aperti, non cancellati.
  const ordiniIds = [...new Set([...lavoro.values()].flatMap((m) => [...m.keys()]))];
  const { data: ordini } = await supabase.from("orders")
    .select("id, order_code, description, work_description, tipo_lavoro, indirizzo_lavori, work_address, client_address, client_name, status, deleted_at, work_end_date")
    .eq("company_id", r.company_id).in("id", ordiniIds);
  const infoOrdine = new Map<string, OrdineInfo>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (ordini ?? []) as any[]) {
    // Gli stessi cantieri aperti del bot. Le commesse restano spesso «confermato»
    // per sempre: quelle con la fine lavori passata da più di due settimane no.
    if (o.deleted_at || !commessaAperta(o.status)) continue;
    if (o.work_end_date && o.work_end_date < giorniPrimaDi(oggi, 14)) continue;
    const titolo = [o.order_code, o.description || o.client_name || o.tipo_lavoro].filter(Boolean).join(" — ") || "cantiere";
    infoOrdine.set(o.id, { titolo, indirizzo: o.indirizzo_lavori || o.work_address || o.client_address || null, descrizione: null });
  }
  // Chi c'è su ogni cantiere oggi (per «con chi»).
  const chiSuOrdine = new Map<string, Set<string>>();
  for (const [empId, perOrdine] of lavoro) for (const oid of perOrdine.keys()) {
    if (!chiSuOrdine.has(oid)) chiSuOrdine.set(oid, new Set());
    chiSuOrdine.get(oid)!.add(empId);
  }
  return { lavoro, empById, empByUser, infoOrdine, chiSuOrdine };
}

async function eseguiTodoOperaio(supabase: DB, r: RoutineRow, oggi: string, force: boolean, prova: Prova): Promise<Esito> {
  const e = vuoto();
  const { lavoro, empById, infoOrdine, chiSuOrdine } = await pianoDelGiorno(supabase, r, oggi);
  if (lavoro.size === 0) { e.skipped++; return e; }
  const nomeBreve = (x: { first_name?: string | null; last_name?: string | null }) => (x.first_name ?? "").trim() || (x.last_name ?? "").trim() || "collega";

  for (const [empId, perOrdine] of lavoro) {
    const x = empById.get(empId);
    const phone = cleanPhone(x?.phone_whatsapp || x?.phone);
    if (!x || !phone) { e.skipped++; continue; }
    // Prova a un solo numero, o solo ai numeri ammessi della routine (operai pilota).
    if (!ammesso(r, phone, prova)) continue;
    const chiave = x.user_id ?? null;
    if (!force && await giaMandato(supabase, r.company_id, oggi, "todo_operaio", chiave, phone)) { e.skipped++; continue; }
    const cantieri: CantiereTodo[] = [...perOrdine.entries()].filter(([oid]) => infoOrdine.has(oid)).map(([oid, fasiNomi]) => {
      const info = infoOrdine.get(oid)!;
      const conChi = [...(chiSuOrdine.get(oid) ?? [])].filter((id) => id !== empId).map((id) => nomeBreve(empById.get(id) ?? {}));
      return { titolo: info.titolo, indirizzo: info.indirizzo, descrizione: null, fasi: [...fasiNomi], conChi };
    });
    if (cantieri.length === 0) { e.skipped++; continue; }
    // Le sue attività in scadenza (solo chi ha l'account: le attività sono assegnate agli utenti).
    let attivita: string[] = [];
    if (x.user_id) {
      const { data: task } = await supabase.from("tasks").select("title, due_date, status")
        .eq("company_id", r.company_id).eq("assigned_to", x.user_id).neq("status", "completata")
        .lte("due_date", oggi).order("due_date", { ascending: true }).limit(3);
      attivita = ((task ?? []) as Array<{ title: string }>).map((t) => t.title).filter(Boolean);
    }
    const nome = `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || null;
    let testo = componiTodoOperaio(nome, cantieri, attivita);
    if (usaAI(r)) {
      testo = await messaggioProattivoAI({
        supabase,
        taskKey: "bot_operativo_operaio",
        companyId: r.company_id,
        istruzioni: "Sono le cose del giorno per un operaio. Tienilo CORTISSIMO e pratico. Per ogni cantiere: indirizzo, cosa c'è da fare oggi (le fasi) e con chi, esattamente come nei dati. Non aggiungere lavorazioni o dettagli non presenti. Ricorda alla fine, in una riga, di mandare il rapportino a fine giornata.",
        dati: { nome, cantieri, attivita },
        testoBase: testo,
        maxTokens: 400,
      });
    }
    if (prova.anteprima) { prova.messaggi.push({ a: phone, nome, testo }); e.sent++; continue; }
    const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
    // Un invio di prova non conta come mandato: il messaggio vero parte lo stesso.
    if (!prova.soloTelefono) await logga(supabase, r, oggi, "todo_operaio", chiave, phone, esito);
    esito.ok ? e.sent++ : e.failed++;
  }
  return e;
}

/**
 * Il rapportino della sera (18/10/2026): all'ora scelta (es. 19:00) scrive a
 * chi oggi era in cantiere secondo la pianificazione e non ha ancora un
 * rapportino inviato, e manda ai destinatari della routine (il titolare)
 * l'elenco di chi manca. Conta come fatto anche il rapportino del capocantiere
 * con dentro la squadra (presenze) e le ore registrate dall'ufficio.
 */
async function eseguiRapportinoSera(supabase: DB, r: RoutineRow, oggi: string, force: boolean, prova: Prova): Promise<Esito> {
  const e = vuoto();
  const { lavoro, empById, empByUser, infoOrdine } = await pianoDelGiorno(supabase, r, oggi);
  if (lavoro.size === 0) { e.skipped++; return e; }

  // Chi è già coperto da un rapportino di oggi (inviato o approvato).
  const { data: rapportini } = await supabase.from("campo_rapportini")
    .select("user_id, presenze, ufficio_employee_id, stato")
    .eq("company_id", r.company_id).eq("data_lavoro", oggi).in("stato", ["inviato", "approvato"]);
  const coperti = copertiDaRapportini(rapportini ?? [], (userId) => empByUser.get(userId)?.id ?? null);

  const mancanti: Array<{ nome: string; cantieri: string[] }> = [];
  for (const [empId, perOrdine] of lavoro) {
    if (coperti.has(empId)) continue;
    const x = empById.get(empId);
    const cantieri = [...perOrdine.keys()].filter((oid) => infoOrdine.has(oid)).map((oid) => infoOrdine.get(oid)!.titolo);
    if (!x || cantieri.length === 0) continue;
    const nome = `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || "Operaio";
    mancanti.push({ nome, cantieri });
    const phone = cleanPhone(x.phone_whatsapp || x.phone);
    if (!phone || !ammesso(r, phone, prova)) { e.skipped++; continue; }
    const chiave = x.user_id ?? null;
    if (!force && await giaMandato(supabase, r.company_id, oggi, "rapportino_sera", chiave, phone)) { e.skipped++; continue; }
    let testo = `Ciao ${(x.first_name ?? "").trim() || nome}, oggi eri su ${cantieri.join(" e ")}. Non mi è ancora arrivato il rapportino: mandamelo qui, anche a voce (ore e cosa hai fatto).`;
    if (usaAI(r)) {
      testo = await messaggioProattivoAI({
        supabase, taskKey: "bot_operativo_operaio", companyId: r.company_id,
        istruzioni: "È il promemoria della sera a un operaio che non ha mandato il rapportino. Una o due righe, gentile e pratico: digli che può mandarlo qui anche a voce con ore e lavori. Non inventare cantieri.",
        dati: { nome, cantieri }, testoBase: testo, maxTokens: 200,
      });
    }
    if (prova.anteprima) { prova.messaggi.push({ a: phone, nome, testo }); e.sent++; continue; }
    const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
    // Un invio di prova non conta come mandato: il messaggio vero parte lo stesso.
    if (!prova.soloTelefono) await logga(supabase, r, oggi, "rapportino_sera", chiave, phone, esito);
    esito.ok ? e.sent++ : e.failed++;
  }

  // Al titolare: chi manca. Solo se la routine ha dei destinatari.
  const destinatari = await risolviDestinatari(supabase, r.company_id, r.destinatari);
  if (destinatari.length > 0 && r.regole?.riepilogo_titolare !== false) {
    const testo = mancanti.length === 0
      ? `Rapportini di oggi: li hanno mandati tutti (${lavoro.size} persone in cantiere).`
      : `Rapportini di oggi: mancano ${mancanti.length} su ${lavoro.size}.\n` +
        mancanti.slice(0, 20).map((m) => `• ${m.nome} — ${m.cantieri.join(", ")}`).join("\n") +
        (mancanti.length > 20 ? `\n…e altri ${mancanti.length - 20}` : "") +
        "\nHo scritto a chi ha il numero in anagrafica.";
    for (const { userId, phone } of destinatari) {
      // L'elenco dei numeri ammessi vale per gli operai; il riepilogo va a chi è
      // stato scelto (in prova, solo al numero della prova).
      if (prova.soloTelefono && phone !== prova.soloTelefono) continue;
      if (!force && await giaMandato(supabase, r.company_id, oggi, "rapportino_sera_riepilogo", userId)) { e.skipped++; continue; }
      if (prova.anteprima) { prova.messaggi.push({ a: phone, nome: "riepilogo", testo }); e.sent++; continue; }
      const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
      if (!prova.soloTelefono) await logga(supabase, r, oggi, "rapportino_sera_riepilogo", userId, phone, esito);
      esito.ok ? e.sent++ : e.failed++;
    }
  }
  return e;
}

/** Il numero può ricevere? Prova a un solo numero, o elenco dei numeri ammessi della routine. */
function ammesso(r: RoutineRow, phone: string, prova: Prova): boolean {
  if (prova.soloTelefono && phone !== prova.soloTelefono) return false;
  if (Array.isArray(r.regole?.solo_telefoni)) return (r.regole!.solo_telefoni as unknown[]).map((t) => cleanPhone(String(t))).includes(phone);
  return true;
}

async function eseguiAvvisi(supabase: DB, r: RoutineRow, oggi: string, force: boolean): Promise<Esito> {
  const e = vuoto();
  const destinatari = await risolviDestinatari(supabase, r.company_id, r.destinatari);
  if (destinatari.length === 0) { e.skipped++; return e; }
  const { data: dati } = await supabase.rpc("bot_avvisi_valuta", { p_company_id: r.company_id, p_regole: r.regole ?? {} });
  const avvisi = componiAvvisi((dati ?? {}) as DatiAvvisi, oggi);
  if (avvisi.length === 0) { e.skipped++; return e; }
  for (const av of avvisi) {
    let testo = av.testo;
    if (usaAI(r)) {
      testo = await messaggioProattivoAI({
        supabase,
        taskKey: "bot_operativo_titolare",
        companyId: r.company_id,
        istruzioni: "È un avviso al titolare. Rendilo chiaro e diretto e, in una riga, di' cosa conviene fare. Non cambiare importi, nomi, numeri o date.",
        dati: av,
        testoBase: av.testo,
        maxTokens: 400,
      });
    }
    for (const { userId, phone } of destinatari) {
      if (!force && await giaMandato(supabase, r.company_id, oggi, av.chiave, userId)) { e.skipped++; continue; }
      const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
      await logga(supabase, r, oggi, av.chiave, userId, phone, esito);
      esito.ok ? e.sent++ : e.failed++;
    }
  }
  return e;
}

async function eseguiPromemoriaAppuntamento(supabase: DB, r: RoutineRow, now: Date, oggi: string, force: boolean): Promise<Esito> {
  const e = vuoto();
  const anticipo = Number(r.regole?.anticipo_min ?? 120) || 120;
  const { minuti } = oraItalianaParti(now);
  const { data: appts } = await supabase.from("appointments")
    .select("id, title, appointment_date, appointment_time, formatted_address, address_line, address_city, assigned_to, order_id, is_completed, status, is_blocked_slot, cancelled_at")
    .eq("company_id", r.company_id)
    .eq("appointment_date", oggi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validi = ((appts ?? []) as any[]).filter((a) =>
    !a.is_completed && !a.is_blocked_slot && !a.cancelled_at &&
    !["cancelled", "annullato", "canceled"].includes(String(a.status ?? "").toLowerCase()),
  ) as AppuntamentoRow[];
  const imminenti = force ? validi : appuntamentiImminenti(validi, oggi, minuti, anticipo);
  if (imminenti.length === 0) { e.skipped++; return e; }

  const base = await risolviDestinatari(supabase, r.company_id, r.destinatari);
  const assegnatari = [...new Set(imminenti.map((a) => a.assigned_to).filter(Boolean))] as string[];
  const telAssegnatario = new Map<string, string>();
  if (assegnatari.length > 0) {
    const { data } = await supabase.from("profiles").select("id, phone").in("id", assegnatari).eq("company_id", r.company_id);
    for (const p of data ?? []) { const ph = cleanPhone(p.phone); if (ph) telAssegnatario.set(p.id, ph); }
  }

  for (const a of imminenti) {
    const dest = (a.assigned_to && telAssegnatario.has(a.assigned_to))
      ? [{ userId: a.assigned_to, phone: telAssegnatario.get(a.assigned_to)! }]
      : base;
    if (dest.length === 0) { e.skipped++; continue; }
    const testo = componiPromemoriaAppuntamento(a);
    const kind = `promemoria_appuntamento:${a.id}`;
    for (const { userId, phone } of dest) {
      if (!force && await giaMandato(supabase, r.company_id, oggi, kind, userId)) { e.skipped++; continue; }
      const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
      await logga(supabase, r, oggi, kind, userId, phone, esito);
      esito.ok ? e.sent++ : e.failed++;
    }
  }
  return e;
}

// Risposta rapida a pg_net (18/10/2026): un messaggio per operaio, con l'AI e
// l'invio, prende secondi; pg_net chiudeva la connessione e il giro si fermava
// dopo i primi uno o due operai. Ora il lavoro continua anche dopo la risposta.
serveConMetricheRapida("bot-routine-dispatch", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({} as { force?: boolean; company_id?: string; anteprima?: boolean; solo_telefono?: string; tipo?: string }));
  const force = body?.force === true;
  // Prova (18/10/2026): «anteprima» restituisce i messaggi senza mandarli né
  // registrarli; «solo_telefono» manda solo a quel numero. Servono a provare una
  // routine su un'azienda vera senza scrivere a tutti gli operai.
  const prova: Prova = { anteprima: body?.anteprima === true, soloTelefono: cleanPhone(body?.solo_telefono ?? null), messaggi: [] };
  const now = new Date();
  const oggi = dataOggiRoma(now);

  let q = supabase.from("bot_routine")
    .select("id, company_id, wa_number_id, ora, giorni, destinatari, regole, template_nome, tipo")
    .eq("attiva", true).in("tipo", ["report_mattino", "todo_operaio", "avviso", "promemoria_appuntamento", "rapportino_sera"]);
  if (body?.company_id) q = q.eq("company_id", body.company_id);
  if (body?.tipo) q = q.eq("tipo", body.tipo);
  const { data: routines } = await q;

  const tot = vuoto();
  for (const r of (routines ?? []) as Array<RoutineRow & { tipo: string }>) {
    // In prova gira solo la routine degli operai: le altre scriverebbero davvero.
    if ((prova.anteprima || prova.soloTelefono) && r.tipo !== "todo_operaio" && r.tipo !== "rapportino_sera") continue;
    const giorni = r.giorni ?? [1, 2, 3, 4, 5];
    let e: Esito;
    if (r.tipo === "promemoria_appuntamento") {
      // Non su orario fisso: gira a ogni giro e guarda gli appuntamenti imminenti.
      if (!force && !giorni.includes(oraItalianaParti(now).giorno)) continue;
      e = await eseguiPromemoriaAppuntamento(supabase, r, now, oggi, force);
    } else {
      if (!routineDovutaOra({ ora: r.ora, giorni }, now, force)) continue;
      e = r.tipo === "todo_operaio" ? await eseguiTodoOperaio(supabase, r, oggi, force, prova)
        : r.tipo === "rapportino_sera" ? await eseguiRapportinoSera(supabase, r, oggi, force, prova)
        : r.tipo === "avviso" ? await eseguiAvvisi(supabase, r, oggi, force)
        : await eseguiReportMattino(supabase, r, now, oggi, force);
    }
    tot.sent += e.sent; tot.skipped += e.skipped; tot.failed += e.failed;
  }

  return new Response(JSON.stringify({ ok: true, ...tot, ...(prova.anteprima ? { anteprima: prova.messaggi } : {}) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function giorniPrimaDi(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
