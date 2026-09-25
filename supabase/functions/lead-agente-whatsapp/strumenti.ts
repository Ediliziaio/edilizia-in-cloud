/**
 * Gli strumenti dell'agente WhatsApp dei lead (25/09/2026).
 *
 * Cinque, come i passi della Conversation AI di GoHighLevel che Il Bagno
 * usava: leggere gli orari veri del calendario, fissare (o spostare) la
 * chiamata, salvare le risposte di qualificazione, segnare il fuori zona,
 * passare la mano a una persona. Ogni esito che conta sposta l'opportunità
 * nella fase scelta dall'azienda, con lo stato automatico della fase (come il
 * kanban): i trigger del database avvisano poi le sue automazioni
 * («Appuntamento prenotato», «Fase cambiata»).
 */

// deno-lint-ignore-file no-explicit-any

import type { ConfigAgenteLead } from "../_shared/agenteLeadConfig.ts";
import { dataEstesa, sincronizzaCalendariEsterni } from "../_shared/appuntamentiPubblici.ts";
import { dataRoma, prenotaSuCalendario, slotLiberiCalendario, STATI_CHE_LIBERANO } from "../_shared/calendarioPrenotazione.ts";
import { fasciaDi, type Fascia } from "../_shared/calendarioSlot.ts";

export interface CtxAgente {
  admin: any;
  companyId: string;
  contactId: string;
  contatto: { first_name: string | null; last_name: string | null; phone: string | null };
  config: ConfigAgenteLead;
  adesso: Date;
  /** Prenotazioni fatte in questo giro: al massimo una. */
  prenotazioniNelGiro: number;
}

export type EsitoStrumento = Record<string, unknown> & { ok: boolean };

interface Strumento {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (ctx: CtxAgente, args: Record<string, unknown>) => Promise<EsitoStrumento>;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FILTRO_ANNULLATI = `(${STATI_CHE_LIBERANO.map((s) => `"${s}"`).join(",")})`;

function nomeContatto(ctx: CtxAgente): string {
  return [ctx.contatto.first_name, ctx.contatto.last_name].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
}

function giornoSettimana(dataIso: string): number {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay();
}

/** L'opportunità aperta più recente del contatto (nella pipeline scelta, se c'è). */
async function opportunitaAperta(ctx: CtxAgente): Promise<{ id: string; pipeline_id: string } | null> {
  let q = ctx.admin
    .from("marketing_opportunities")
    .select("id, pipeline_id")
    .eq("company_id", ctx.companyId)
    .eq("contact_id", ctx.contactId)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ctx.config.pipelineId) q = q.eq("pipeline_id", ctx.config.pipelineId);
  const { data } = await q;
  return (data?.[0] as { id: string; pipeline_id: string } | undefined) ?? null;
}

/** Una fase dell'azienda, con il suo stato automatico (lost/won). */
async function faseDellAzienda(ctx: CtxAgente, faseId: string): Promise<{ id: string; pipeline_id: string; auto_status: string | null } | null> {
  const { data } = await ctx.admin
    .from("marketing_pipeline_stages")
    .select("id, pipeline_id, auto_status")
    .eq("id", faseId).eq("company_id", ctx.companyId)
    .maybeSingle();
  return data ?? null;
}

/**
 * L'opportunità del contatto, creata se manca. Un lead arrivato direttamente
 * su WhatsApp (non dal modulo Facebook) non ce l'ha: nasce nella pipeline
 * dell'agente, nella fase indicata o nella prima.
 */
async function assicuraOpportunita(ctx: CtxAgente, faseIniziale: string | null): Promise<{ id: string; pipeline_id: string } | null> {
  const esistente = await opportunitaAperta(ctx);
  if (esistente || !ctx.config.pipelineId) return esistente;
  let stageId = faseIniziale;
  let status = "open";
  if (stageId) {
    const fase = await faseDellAzienda(ctx, stageId);
    if (!fase || fase.pipeline_id !== ctx.config.pipelineId) stageId = null;
    else if (fase.auto_status) status = fase.auto_status;
  }
  if (!stageId) {
    const { data: prima } = await ctx.admin
      .from("marketing_pipeline_stages").select("id")
      .eq("pipeline_id", ctx.config.pipelineId).eq("company_id", ctx.companyId)
      .order("position").limit(1);
    stageId = prima?.[0]?.id ?? null;
  }
  if (!stageId) return null;
  const { data, error } = await ctx.admin.from("marketing_opportunities").insert({
    company_id: ctx.companyId,
    contact_id: ctx.contactId,
    pipeline_id: ctx.config.pipelineId,
    stage_id: stageId,
    name: nomeContatto(ctx) || ctx.contatto.phone || "Lead WhatsApp",
    status,
    source: "whatsapp",
  }).select("id, pipeline_id").single();
  if (error) {
    console.warn("[lead-agente] opportunità non creata:", error.message);
    return null;
  }
  return data;
}

/** Sposta l'opportunità (creandola se manca), solo su una fase della sua pipeline, con lo stato automatico. */
async function spostaFase(ctx: CtxAgente, faseId: string | null): Promise<boolean> {
  if (!faseId) return false;
  const fase = await faseDellAzienda(ctx, faseId);
  if (!fase) return false;
  const esistente = await opportunitaAperta(ctx);
  if (!esistente) {
    const creata = await assicuraOpportunita(ctx, faseId);
    return Boolean(creata);
  }
  if (fase.pipeline_id !== esistente.pipeline_id) return false;
  const aggiornamento: Record<string, unknown> = { stage_id: faseId };
  if (fase.auto_status) aggiornamento.status = fase.auto_status;
  const { error } = await ctx.admin
    .from("marketing_opportunities").update(aggiornamento).eq("id", esistente.id).eq("company_id", ctx.companyId);
  if (error) console.warn("[lead-agente] fase non spostata:", error.message);
  return !error;
}

async function unisciQualificazione(ctx: CtxAgente, dati: Record<string, unknown>): Promise<void> {
  const { data: c } = await ctx.admin
    .from("marketing_contacts").select("qualificazione_json").eq("id", ctx.contactId).maybeSingle();
  const attuale = (c?.qualificazione_json && typeof c.qualificazione_json === "object") ? c.qualificazione_json : {};
  await ctx.admin
    .from("marketing_contacts")
    .update({ qualificazione_json: { ...attuale, ...dati, aggiornato_il: ctx.adesso.toISOString() } })
    .eq("id", ctx.contactId);
}

async function aggiungiTag(ctx: CtxAgente, tag: string | null): Promise<void> {
  if (!tag) return;
  const { data: c } = await ctx.admin.from("marketing_contacts").select("tags").eq("id", ctx.contactId).maybeSingle();
  const tags: string[] = Array.isArray(c?.tags) ? c.tags : [];
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  await ctx.admin.from("marketing_contacts").update({ tags: [...tags, tag] }).eq("id", ctx.contactId);
}

/** Il prossimo appuntamento del contatto su questo calendario, se c'è. */
async function appuntamentoInCorso(ctx: CtxAgente): Promise<{ id: string; appointment_date: string; appointment_time: string } | null> {
  const { data } = await ctx.admin
    .from("appointments")
    .select("id, appointment_date, appointment_time")
    .eq("company_id", ctx.companyId)
    .eq("contact_id", ctx.contactId)
    .eq("calendar_id", ctx.config.calendarioId)
    .gte("appointment_date", dataRoma(ctx.adesso))
    .not("status", "in", FILTRO_ANNULLATI)
    .order("appointment_date").order("appointment_time")
    .limit(1);
  return data?.[0] ?? null;
}

function giornoDa(arg: unknown, adesso: Date): string | null {
  const v = String(arg ?? "").trim().toLowerCase();
  const oggi = dataRoma(adesso);
  if (!v || v === "oggi") return oggi;
  if (v === "domani") return dataRoma(adesso, 1);
  if (v === "dopodomani") return dataRoma(adesso, 2);
  if (DATA_ISO.test(v) && v >= oggi) return v;
  return null;
}

// ── orari_liberi ────────────────────────────────────────────────────────────

const orariLiberi: Strumento = {
  name: "orari_liberi",
  description:
    "Legge gli orari liberi VERI del calendario delle chiamate. Usalo prima di proporre qualunque orario. Restituisce fino a 3 giorni con orari disponibili nella fascia richiesta.",
  parameters: {
    type: "object",
    properties: {
      giorno: { type: "string", description: "«oggi», «domani», «dopodomani» oppure una data YYYY-MM-DD. Se manca, da oggi in avanti." },
      fascia: { type: "string", enum: ["mattina", "pomeriggio", "sera"], description: "La fascia preferita dal cliente, se l'ha detta." },
    },
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const primo = giornoDa(args.giorno, ctx.adesso);
    if (!primo) return { ok: false, errore: "giorno_non_valido", messaggio: "Giorno non valido o già passato." };
    const fascia = (["mattina", "pomeriggio", "sera"] as const).includes(args.fascia as Fascia) ? (args.fascia as Fascia) : null;

    const [y, m, d] = primo.split("-").map(Number);
    const giorni: Array<{ data: string; giorno: string; orari: string[] }> = [];
    let calendarioNome = "";
    for (let i = 0; i < ctx.config.giorniProposta && giorni.length < 3; i++) {
      const dataIso = new Date(Date.UTC(y, m - 1, d + i, 12)).toISOString().slice(0, 10);
      const settimana = giornoSettimana(dataIso);
      if (ctx.config.soloFeriali && (settimana === 0 || settimana === 6)) continue;
      const { calendario, slot } = await slotLiberiCalendario(ctx.admin, ctx.config.calendarioId, dataIso, { companyId: ctx.companyId, adesso: ctx.adesso });
      if (!calendario) return { ok: false, errore: "calendario_non_valido", messaggio: "Il calendario delle chiamate non è attivo." };
      calendarioNome = calendario.name;
      const orari = (fascia ? slot.filter((s) => fasciaDi(s) === fascia) : slot).slice(0, 6);
      if (orari.length) giorni.push({ data: dataIso, giorno: dataEstesa(dataIso), orari });
    }
    return {
      ok: true,
      calendario: calendarioNome,
      fascia: fascia ?? "tutte",
      giorni,
      nota: giorni.length
        ? "Proponi al cliente al massimo 3 orari per messaggio, presi da questo elenco."
        : "Nessun orario libero nei prossimi giorni in questa fascia: proponi un'altra fascia o passa a un operatore.",
    };
  },
};

// ── prenota_chiamata ────────────────────────────────────────────────────────

const prenotaChiamata: Strumento = {
  name: "prenota_chiamata",
  description:
    "Fissa la telefonata con un consulente all'orario scelto dal cliente (deve essere uno di quelli dati da orari_liberi). Se il cliente ha già una chiamata fissata risponde gia_prenotato: per spostarla richiamalo con sposta=true solo se il cliente ha chiesto di cambiarla. Conferma al cliente SOLO se risponde ok.",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string", description: "YYYY-MM-DD" },
      ora: { type: "string", description: "HH:MM" },
      sposta: { type: "boolean", description: "true solo se il cliente ha chiesto di spostare la chiamata già fissata." },
    },
    required: ["data", "ora"],
    additionalProperties: false,
  },
  async handler(ctx, args) {
    if (ctx.prenotazioniNelGiro >= 1) return { ok: false, errore: "una_alla_volta", messaggio: "Una sola prenotazione per risposta." };
    const data = String(args.data ?? "").trim();
    const ora = String(args.ora ?? "").trim().slice(0, 5);
    if (!DATA_ISO.test(data) || !ORA.test(ora)) return { ok: false, errore: "formato", messaggio: "Servono data YYYY-MM-DD e ora HH:MM." };

    // Le stesse regole con cui si propongono gli orari.
    const oggi = dataRoma(ctx.adesso);
    const ultimo = dataRoma(ctx.adesso, ctx.config.giorniProposta + 7);
    if (data < oggi || data > ultimo) return { ok: false, errore: "fuori_orizzonte", messaggio: "Questa data non è tra quelle prenotabili: richiama orari_liberi." };
    const settimana = giornoSettimana(data);
    if (ctx.config.soloFeriali && (settimana === 0 || settimana === 6)) {
      return { ok: false, errore: "giorno_non_feriale", messaggio: "Si prenota solo dal lunedì al venerdì." };
    }

    const giaFissato = await appuntamentoInCorso(ctx);
    if (giaFissato && args.sposta !== true) {
      return {
        ok: false,
        errore: "gia_prenotato",
        data: giaFissato.appointment_date,
        ora: String(giaFissato.appointment_time).slice(0, 5),
        messaggio: `Il cliente ha già una chiamata fissata ${dataEstesa(giaFissato.appointment_date)} alle ${String(giaFissato.appointment_time).slice(0, 5)}.`,
      };
    }

    // L'opportunità esiste prima dell'appuntamento: i trigger dell'insert la vedono.
    const opp = await assicuraOpportunita(ctx, null);
    const { data: c } = await ctx.admin.from("marketing_contacts").select("qualificazione_json").eq("id", ctx.contactId).maybeSingle();
    const q = (c?.qualificazione_json ?? {}) as Record<string, unknown>;
    const nome = nomeContatto(ctx) || "Lead WhatsApp";
    const esito = await prenotaSuCalendario(ctx.admin, {
      calendarId: ctx.config.calendarioId,
      companyId: ctx.companyId,
      dataIso: data,
      ora,
      contactId: ctx.contactId,
      opportunityId: opp?.id ?? null,
      titolo: `${nome} — chiamata dal WhatsApp`,
      descrizione: [
        ctx.contatto.phone && `Tel: ${ctx.contatto.phone}`,
        q.zona && `Zona: ${q.zona}`,
        q.intervento && `Intervento: ${q.intervento}`,
        q.tempistica && `Tempistica: ${q.tempistica}`,
        q.motivazione && `Motivazione: ${q.motivazione}`,
        "Fissato dall'assistente WhatsApp.",
      ].filter(Boolean).join("\n"),
      tipo: "agente_ai",
      adesso: ctx.adesso,
    });
    if (!esito.ok) return { ok: false, errore: esito.motivo, messaggio: esito.messaggio };
    ctx.prenotazioniNelGiro++;

    // Spostamento: la chiamata di prima si annulla solo dopo che la nuova c'è.
    if (giaFissato) {
      const { data: cal } = await ctx.admin.from("marketing_calendars").select("owner_id").eq("id", ctx.config.calendarioId).maybeSingle();
      await ctx.admin.from("appointments").update({ status: "annullato" }).eq("id", giaFissato.id).eq("company_id", ctx.companyId);
      await sincronizzaCalendariEsterni({ azione: "delete-event", appointmentId: giaFissato.id, companyId: ctx.companyId, userId: cal?.owner_id ?? null });
    }

    const fase = await spostaFase(ctx, ctx.config.fasePrenotatoId);
    await aggiungiTag(ctx, ctx.config.tagPrenotato);
    await unisciQualificazione(ctx, { appuntamento: { data, ora, appointment_id: esito.appointmentId } });
    return { ok: true, quando: esito.quando, data, ora, spostata: Boolean(giaFissato), fase_spostata: fase };
  },
};

// ── salva_risposte ──────────────────────────────────────────────────────────

const salvaRisposte: Strumento = {
  name: "salva_risposte",
  description: "Salva le risposte del cliente alle domande (zona, intervento, tempistica, motivazione). Chiamalo appena il cliente risponde a una di esse.",
  parameters: {
    type: "object",
    properties: {
      zona: { type: "string" },
      intervento: { type: "string" },
      tempistica: { type: "string" },
      motivazione: { type: "string" },
      note: { type: "string" },
    },
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const dati: Record<string, string> = {};
    for (const k of ["zona", "intervento", "tempistica", "motivazione", "note"]) {
      const v = String(args[k] ?? "").trim();
      if (v) dati[k] = v.slice(0, 500);
    }
    if (!Object.keys(dati).length) return { ok: false, errore: "vuoto" };
    await unisciQualificazione(ctx, dati);
    await ctx.admin.from("marketing_contact_activities").insert({
      company_id: ctx.companyId,
      contact_id: ctx.contactId,
      activity_type: "qualificazione_whatsapp",
      description: Object.entries(dati).map(([k, v]) => `${k}: ${v}`).join(" · "),
      metadata: { origine: "agente_whatsapp", ...dati },
    });
    return { ok: true, salvate: Object.keys(dati) };
  },
};

// ── segna_fuori_zona ────────────────────────────────────────────────────────

const segnaFuoriZona: Strumento = {
  name: "segna_fuori_zona",
  description: "Il lavoro è fuori dalla zona servita: segna l'opportunità come fuori raggio. Poi chiudi con gentilezza, senza fissare la chiamata.",
  parameters: {
    type: "object",
    properties: { zona: { type: "string" } },
    required: ["zona"],
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const zona = String(args.zona ?? "").trim().slice(0, 200);
    await unisciQualificazione(ctx, { zona, fuori_zona: true });
    const fase = await spostaFase(ctx, ctx.config.faseFuoriZonaId);
    return { ok: true, fase_spostata: fase };
  },
};

// ── passa_a_operatore ───────────────────────────────────────────────────────

const passaAOperatore: Strumento = {
  name: "passa_a_operatore",
  description:
    "Passa la conversazione a una persona del team: l'assistente smette di rispondere a questo cliente. Usalo se il cliente chiede una persona, è arrabbiato, o la richiesta non rientra nelle istruzioni.",
  parameters: {
    type: "object",
    properties: { motivo: { type: "string" } },
    required: ["motivo"],
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const motivo = String(args.motivo ?? "").trim().slice(0, 300) || "Richiesta del cliente";
    const { error } = await ctx.admin.from("conversazioni").upsert({
      company_id: ctx.companyId,
      entita_tipo: "contatto",
      entita_id: ctx.contactId,
      bot_in_pausa: true,
      bot_in_pausa_motivo: motivo,
      bot_in_pausa_il: ctx.adesso.toISOString(),
    }, { onConflict: "company_id,entita_tipo,entita_id" });
    if (error) console.warn("[lead-agente] pausa non salvata:", error.message);
    const fase = await spostaFase(ctx, ctx.config.faseOperatoreId);
    const nome = nomeContatto(ctx) || ctx.contatto.phone || "un lead";
    await avvisaUtenti(ctx, `WhatsApp: ${nome} chiede una persona`, `L'assistente ha passato la conversazione. Motivo: ${motivo}`);
    return { ok: !error, in_pausa: !error, fase_spostata: fase };
  },
};

/** Avvisa in app le persone scelte nella configurazione, solo se sono dell'azienda. */
export async function avvisaUtenti(ctx: Pick<CtxAgente, "admin" | "companyId" | "contactId" | "config">, titolo: string, testo: string): Promise<void> {
  if (!ctx.config.utentiDaAvvisare.length) return;
  const { data: persone } = await ctx.admin
    .from("profiles").select("id").eq("company_id", ctx.companyId).in("id", ctx.config.utentiDaAvvisare);
  for (const p of (persone ?? []) as Array<{ id: string }>) {
    const { error } = await ctx.admin.rpc("create_notification", {
      p_company_id: ctx.companyId,
      p_user_id: p.id,
      p_type: "lead_whatsapp_agente",
      p_title: titolo,
      p_body: testo,
      p_entity_type: "marketing_contact",
      p_entity_id: ctx.contactId,
      p_action_url: "/azienda/conversazioni",
    });
    if (error) console.warn("[lead-agente] notifica non creata:", error.message);
  }
}

export const STRUMENTI_AGENTE_LEAD: Strumento[] = [orariLiberi, prenotaChiamata, salvaRisposte, segnaFuoriZona, passaAOperatore];

export function specificheStrumenti() {
  return STRUMENTI_AGENTE_LEAD.map((s) => ({
    type: "function" as const,
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }));
}

export function trovaStrumento(nome: string): Strumento | undefined {
  return STRUMENTI_AGENTE_LEAD.find((s) => s.name === nome);
}
