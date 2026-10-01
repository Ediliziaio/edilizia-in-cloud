// bot-routine-dispatch — le automazioni del bot operativo che partono da sole
// (28/09/2026). Gira ogni 15 minuti (pg_cron). Per ora: il report del mattino.
// Legge bot_routine, per ogni routine dovuta manda il messaggio ai destinatari
// via whatsapp-send (testo se la finestra 24h è aperta, altrimenti il modello
// Meta), e logga in wa_operational_reminder_log per non ripetere.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { oraItalianaParti, routineDovutaOra } from "../_shared/routineOperativa.ts";
import { componiReportMattino, type DatiReport } from "../_shared/reportMattino.ts";
import { componiTodoOperaio, type CantiereTodo } from "../_shared/todoOperaio.ts";
import { componiAvvisi, type DatiAvvisi } from "../_shared/avvisiOperativi.ts";
import { appuntamentiImminenti, type AppuntamentoRow, componiPromemoriaAppuntamento } from "../_shared/promemoriaAppuntamento.ts";
import { messaggioProattivoAI } from "../_shared/messaggioProattivoAI.ts";

/** L'AqI scrive il messaggio, se non è stata disattivata nella routine. */
function usaAI(r: RoutineRow): boolean {
  return r.regole?.ai !== false;
}

interface Esito { sent: number; skipped: number; failed: number; }
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
    const { data } = await supabase
      .from("profiles").select("id, phone, user_roles!inner(role)")
      .eq("company_id", companyId).in("user_roles.role", ["company_admin", "super_admin"]);
    for (const r of data ?? []) aggiungi(r.id, r.phone);
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
        template: { name: templateNome, language: "it", variables: { "1": testo } },
      }),
    });
    if (modRes.ok) return { ok: true };
    return { ok: false, detail: (await modRes.text()).slice(0, 400) };
  }
  return { ok: false, detail: (await testoRes.text()).slice(0, 400) };
}

/** Un messaggio già mandato oggi a questa persona per questo tipo? (anti-ripetizione) */
async function giaMandato(supabase: DB, companyId: string, oggi: string, kind: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from("wa_operational_reminder_log").select("id")
    .eq("company_id", companyId).eq("reminder_date", oggi).eq("reminder_kind", kind)
    .eq("employee_user_id", userId).eq("status", "sent").maybeSingle();
  return !!data;
}

async function logga(supabase: DB, r: RoutineRow, oggi: string, kind: string, userId: string, phone: string, esito: { ok: boolean; detail?: string }) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RigaAssegnazione = { user_id: string | null; order_id: string | null; orders?: any };

async function eseguiTodoOperaio(supabase: DB, r: RoutineRow, oggi: string, force: boolean): Promise<Esito> {
  const e = vuoto();
  // Assegnazioni di oggi (stesso filtro del promemoria rapportino), con i dati
  // del cantiere per dire dove e con chi si lavora.
  const { data: assegnazioni } = await supabase.from("order_campo_assignments")
    .select("user_id, order_id, orders(order_code, description, work_description, tipo_lavoro, indirizzo_lavori, work_address, client_address, client_name)")
    .eq("company_id", r.company_id)
    .or(`data_inizio.is.null,data_inizio.lte.${oggi}`)
    .or(`data_fine_prevista.is.null,data_fine_prevista.gte.${oggi}`);

  const infoOrdine = new Map<string, OrdineInfo>();
  const utentiPerOrdine = new Map<string, Set<string>>();
  const ordiniPerUtente = new Map<string, string[]>();
  for (const a of (assegnazioni ?? []) as RigaAssegnazione[]) {
    if (!a.user_id || !a.order_id) continue;
    if (!infoOrdine.has(a.order_id)) {
      const o = a.orders ?? {};
      const titolo = [o.order_code, o.description || o.client_name || o.tipo_lavoro].filter(Boolean).join(" — ") || "cantiere assegnato";
      const indirizzo = o.indirizzo_lavori || o.work_address || o.client_address || null;
      const descrizione = o.work_description || (o.description && o.description !== titolo ? o.description : null) || null;
      infoOrdine.set(a.order_id, { titolo, indirizzo, descrizione });
    }
    if (!utentiPerOrdine.has(a.order_id)) utentiPerOrdine.set(a.order_id, new Set());
    utentiPerOrdine.get(a.order_id)!.add(a.user_id);
    const arr = ordiniPerUtente.get(a.user_id) ?? [];
    if (!arr.includes(a.order_id)) arr.push(a.order_id);
    ordiniPerUtente.set(a.user_id, arr);
  }
  if (ordiniPerUtente.size === 0) { e.skipped++; return e; }

  // Nomi + telefono di TUTTI gli assegnati (i nomi servono anche per «con chi»).
  const tuttiUtenti = new Set<string>();
  for (const s of utentiPerOrdine.values()) for (const u of s) tuttiUtenti.add(u);
  const { data: employees } = await supabase.from("employees")
    .select("user_id, first_name, last_name, phone, phone_whatsapp, is_active")
    .eq("company_id", r.company_id).in("user_id", [...tuttiUtenti]);
  const nomeCompleto = new Map<string, string>();
  const nomeBreve = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empPerUtente = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const emp of (employees ?? []) as any[]) {
    if (!emp.user_id) continue;
    const pieno = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
    nomeCompleto.set(emp.user_id, pieno || "collega");
    nomeBreve.set(emp.user_id, (emp.first_name ?? "").trim() || pieno.split(" ")[0] || "collega");
    empPerUtente.set(emp.user_id, emp);
  }

  for (const [userId, ordini] of ordiniPerUtente) {
    const emp = empPerUtente.get(userId);
    if (!emp || emp.is_active === false) { e.skipped++; continue; }
    const phone = cleanPhone(emp.phone_whatsapp || emp.phone);
    if (!phone) { e.skipped++; continue; }
    if (!force && await giaMandato(supabase, r.company_id, oggi, "todo_operaio", userId)) { e.skipped++; continue; }
    const cantieri: CantiereTodo[] = ordini.map((oid) => {
      const info = infoOrdine.get(oid)!;
      const conChi = [...(utentiPerOrdine.get(oid) ?? [])].filter((u) => u !== userId).map((u) => nomeBreve.get(u) ?? "collega");
      return { titolo: info.titolo, indirizzo: info.indirizzo, descrizione: info.descrizione, conChi };
    });
    let testo = componiTodoOperaio(nomeCompleto.get(userId) ?? null, cantieri);
    if (usaAI(r)) {
      testo = await messaggioProattivoAI({
        supabase,
        taskKey: "bot_operativo_operaio",
        companyId: r.company_id,
        istruzioni: "Sono le cose del giorno per un operaio. Tienilo CORTISSIMO e pratico. Elenca i cantieri con indirizzo e con chi lavora, esattamente come nei dati. Non aggiungere lavorazioni o dettagli non presenti. Ricorda alla fine, in una riga, di mandare il rapportino a fine giornata.",
        dati: { nome: nomeCompleto.get(userId) ?? null, cantieri },
        testoBase: testo,
        maxTokens: 400,
      });
    }
    const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
    await logga(supabase, r, oggi, "todo_operaio", userId, phone, esito);
    esito.ok ? e.sent++ : e.failed++;
  }
  return e;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({} as { force?: boolean; company_id?: string }));
  const force = body?.force === true;
  const now = new Date();
  const oggi = dataOggiRoma(now);

  let q = supabase.from("bot_routine")
    .select("id, company_id, wa_number_id, ora, giorni, destinatari, regole, template_nome, tipo")
    .eq("attiva", true).in("tipo", ["report_mattino", "todo_operaio", "avviso", "promemoria_appuntamento"]);
  if (body?.company_id) q = q.eq("company_id", body.company_id);
  const { data: routines } = await q;

  const tot = vuoto();
  for (const r of (routines ?? []) as Array<RoutineRow & { tipo: string }>) {
    const giorni = r.giorni ?? [1, 2, 3, 4, 5];
    let e: Esito;
    if (r.tipo === "promemoria_appuntamento") {
      // Non su orario fisso: gira a ogni giro e guarda gli appuntamenti imminenti.
      if (!force && !giorni.includes(oraItalianaParti(now).giorno)) continue;
      e = await eseguiPromemoriaAppuntamento(supabase, r, now, oggi, force);
    } else {
      if (!routineDovutaOra({ ora: r.ora, giorni }, now, force)) continue;
      e = r.tipo === "todo_operaio" ? await eseguiTodoOperaio(supabase, r, oggi, force)
        : r.tipo === "avviso" ? await eseguiAvvisi(supabase, r, oggi, force)
        : await eseguiReportMattino(supabase, r, now, oggi, force);
    }
    tot.sent += e.sent; tot.skipped += e.skipped; tot.failed += e.failed;
  }

  return new Response(JSON.stringify({ ok: true, ...tot }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
