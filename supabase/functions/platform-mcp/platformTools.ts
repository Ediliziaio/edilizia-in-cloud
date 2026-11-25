// Strumenti dell'area superadmin (25/11/2026).
//
// Visibili solo a un collegamento di ambito «piattaforma»: un consenso OAuth
// dato da un super admin scegliendo «Area superadmin» sulla pagina di consenso,
// oppure una chiave API senza azienda con gli scope platform:*. Ogni strumento
// ricontrolla, prima di lavorare, che chi ha dato il consenso sia ancora super
// admin e nella lista delle email ammesse (stessa regola di requireRole).
//
// Regola: si usa la stessa strada della pagina, mai una copia della logica.
// - Le funzioni admin_* del database, che controllano auth.uid(), passano da
//   mcp_superadmin_chiama: esegue «come» il superadmin, con un elenco chiuso.
// - Crea azienda e cambio piano usano gli stessi moduli delle edge function
//   (_shared/creaAzienda.ts, _shared/changeCompanyPlan.ts).
// - CRM, email e gestionale delle aziende: gli strumenti aziendali di sempre,
//   con company = nome/UUID dell'azienda, o "piattaforma" per il CRM del superadmin.
//
// Fuori di proposito: purga e cancellazioni, impersonazione, gestione dei super
// admin e dei permessi, segreti della piattaforma, rimborsi Stripe, invio di
// campagne a una lista. Restano nell'interfaccia.

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type KeyCtx, type ToolDef, ToolError, PLATFORM_COMPANY_ID, UUID_RE, str, num, intLimit } from "./lib.ts";
import { emailSuperAdminConsentita } from "../_shared/superAdminAllowlist.ts";
import { changeCompanyPlan } from "../_shared/changeCompanyPlan.ts";
import { creaAzienda } from "../_shared/creaAzienda.ts";

// ── Controlli ────────────────────────────────────────────────────────────────

/** Il collegamento è di piattaforma e chi l'ha dato è (ancora) super admin ammesso. */
export async function assicuraSuperadmin(admin: SupabaseClient, ctx: KeyCtx): Promise<void> {
  if (ctx.ambito !== "piattaforma" || ctx.company_id) {
    throw new ToolError("Strumento dell'area superadmin: questo collegamento è limitato a un'azienda.");
  }
  const { data: ruoli } = await admin.from("user_roles").select("role").eq("user_id", ctx.created_by);
  const superAdmin = (ruoli ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!superAdmin) throw new ToolError("Solo il super admin può usare gli strumenti dell'area superadmin.");
  const { data: utente } = await admin.auth.admin.getUserById(ctx.created_by);
  if (!emailSuperAdminConsentita(utente?.user?.email)) {
    throw new ToolError("Account non abilitato all'area superadmin.");
  }
}

async function chiama(admin: SupabaseClient, ctx: KeyCtx, cosa: string, param: Record<string, unknown> = {}) {
  const { data, error } = await admin.rpc("mcp_superadmin_chiama", { p_actor: ctx.created_by, p_cosa: cosa, p_param: param });
  if (error) throw new ToolError(error.message);
  return data;
}

/** Azienda cliente per nome o UUID (mai quella della piattaforma: non ha piano). */
async function aziendaCliente(admin: SupabaseClient, raw: unknown): Promise<{ id: string; name: string }> {
  const testo = str(raw);
  if (!testo) throw new ToolError('Parametro "company" obbligatorio (nome o UUID dell\'azienda)');
  let righe: { id: string; name: string }[] = [];
  if (UUID_RE.test(testo)) {
    const { data } = await admin.from("companies").select("id, name").eq("id", testo).is("deleted_at", null).limit(1);
    righe = data ?? [];
  } else {
    const { data } = await admin.from("companies").select("id, name").ilike("name", `%${testo}%`).is("deleted_at", null).limit(6);
    righe = data ?? [];
    const esatta = righe.filter((r) => r.name.toLowerCase() === testo.toLowerCase());
    if (esatta.length === 1) righe = esatta;
  }
  righe = righe.filter((r) => r.id !== PLATFORM_COMPANY_ID);
  if (righe.length === 0) throw new ToolError(`Nessuna azienda trovata per «${testo}»`);
  if (righe.length > 1) throw new ToolError(`Più aziende corrispondono a «${testo}»: ${righe.map((r) => r.name).join(", ")}. Specifica meglio o usa l'UUID.`);
  return righe[0];
}

async function pianoDa(admin: SupabaseClient, raw: unknown): Promise<{ id: string; name: string }> {
  const testo = str(raw);
  if (!testo) throw new ToolError('Parametro "piano" obbligatorio (nome, slug o UUID). Usa lista_piani.');
  const q = admin.from("subscription_plans").select("id, name, slug").eq("is_active", true).is("produttore_id", null);
  const { data } = UUID_RE.test(testo) ? await q.eq("id", testo) : await q;
  const piani = (data ?? []) as { id: string; name: string; slug: string | null }[];
  const t = testo.toLowerCase();
  const trovati = UUID_RE.test(testo) ? piani
    : piani.filter((p) => p.name.toLowerCase() === t || (p.slug ?? "").toLowerCase() === t);
  const simili = trovati.length ? trovati : piani.filter((p) => p.name.toLowerCase().includes(t));
  if (simili.length === 0) throw new ToolError(`Nessun piano attivo «${testo}». Usa lista_piani.`);
  if (simili.length > 1) throw new ToolError(`Più piani corrispondono a «${testo}»: ${simili.map((p) => p.name).join(", ")}.`);
  return simili[0];
}

/** Le funzioni condivise con le edge function rispondono con una Response. */
async function esitoDa(risposta: Response): Promise<Record<string, unknown>> {
  const corpo = await risposta.json().catch(() => ({})) as Record<string, unknown>;
  if (!risposta.ok) throw new ToolError(String(corpo.error ?? corpo.message ?? `Errore ${risposta.status}`));
  return corpo;
}

async function registra(admin: SupabaseClient, ctx: KeyCtx, azione: string, aziendaId: string | null, dettagli: Record<string, unknown>) {
  await admin.from("admin_audit_log").insert({
    user_id: ctx.created_by, action: azione, target_type: "company", target_id: aziendaId,
    details: { ...dettagli, via: `mcp:${ctx.name}` },
  });
}

const vuoto = { type: "object", properties: {}, additionalProperties: false };
const conSuperadmin = (t: ToolDef): ToolDef => ({
  ...t,
  handler: async (admin, ctx, args) => {
    await assicuraSuperadmin(admin, ctx);
    return t.handler(admin, ctx, args);
  },
});

// ── Strumenti ───────────────────────────────────────────────────────────────

const STRUMENTI: ToolDef[] = [
  {
    name: "statistiche_piattaforma",
    description: "Numeri della piattaforma oggi: MRR incassato, aziende paganti/regalate, insoluti, a listino non fatturato, costi dei tool AI del mese, attività di outreach. Da usare per «come va il business».",
    scope: "platform:read",
    inputSchema: vuoto,
    handler: async (admin, ctx) => {
      const [soldi, outreach] = await Promise.all([chiama(admin, ctx, "home_soldi"), chiama(admin, ctx, "home_outreach")]);
      const { data: mrr } = await admin.from("mrr_snapshots")
        .select("data, mrr_stripe_cents, mrr_interno_cents, mrr_regalato_cents, aziende_attive_stripe, aziende_attive_interno, aziende_regalate")
        .order("data", { ascending: false }).limit(1);
      return { soldi, outreach, ultimo_mrr: mrr?.[0] ?? null, nota: "Importi in euro; i campi *_cents sono centesimi." };
    },
  },
  {
    name: "andamento_mrr",
    description: "Andamento dell'MRR negli ultimi mesi (una foto per fine mese): Stripe, interno, regalato, aziende attive.",
    scope: "platform:read",
    inputSchema: { type: "object", properties: { mesi: { type: "integer", minimum: 1, maximum: 24 } }, additionalProperties: false },
    handler: async (admin, _ctx, args) => {
      const mesi = intLimit(args.mesi, 6, 24);
      const dal = new Date(); dal.setMonth(dal.getMonth() - mesi);
      const { data, error } = await admin.from("mrr_snapshots")
        .select("data, mrr_stripe_cents, mrr_interno_cents, mrr_regalato_cents, aziende_attive_stripe, aziende_attive_interno, aziende_regalate, mrr_altri_prodotti_cents")
        .gte("data", dal.toISOString().slice(0, 10)).order("data", { ascending: true });
      if (error) throw new ToolError(error.message);
      const perMese = new Map<string, Record<string, unknown>>();
      for (const r of data ?? []) perMese.set(String(r.data).slice(0, 7), r);
      return {
        mesi: [...perMese.entries()].map(([mese, r]) => ({
          mese,
          mrr_stripe: Number(r.mrr_stripe_cents ?? 0) / 100,
          mrr_interno: Number(r.mrr_interno_cents ?? 0) / 100,
          mrr_regalato: Number(r.mrr_regalato_cents ?? 0) / 100,
          mrr_altri_prodotti: Number(r.mrr_altri_prodotti_cents ?? 0) / 100,
          aziende_stripe: r.aziende_attive_stripe, aziende_interno: r.aziende_attive_interno, aziende_regalate: r.aziende_regalate,
        })),
      };
    },
  },
  {
    name: "aziende_piattaforma",
    description: "Elenco delle aziende clienti con stato, piano, utenti, ultimo accesso e MRR. Filtri: stato (trial, active, suspended, expired, free), piano, testo nel nome.",
    scope: "platform:read",
    inputSchema: {
      type: "object",
      properties: {
        stato: { type: "string", enum: ["trial", "active", "suspended", "expired", "free"] },
        piano: { type: "string", description: "Parte del nome del piano" },
        cerca: { type: "string", description: "Parte del nome dell'azienda" },
        limite: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const tutte = (await chiama(admin, ctx, "home_aziende") ?? []) as Record<string, unknown>[];
      const stato = str(args.stato); const piano = str(args.piano)?.toLowerCase(); const cerca = str(args.cerca)?.toLowerCase();
      const filtrate = tutte.filter((a) =>
        (!stato || a.stato === stato)
        && (!piano || String(a.piano ?? "").toLowerCase().includes(piano))
        && (!cerca || String(a.nome ?? "").toLowerCase().includes(cerca)));
      const limite = intLimit(args.limite, 50, 200);
      return { totale: filtrate.length, aziende: filtrate.slice(0, limite) };
    },
  },
  {
    name: "scheda_azienda_piattaforma",
    description: "Scheda di un'azienda cliente vista dal superadmin: dati, stato, piano, prova, pagamento, metriche, ultimi eventi dell'abbonamento.",
    scope: "platform:read",
    inputSchema: { type: "object", properties: { company: { type: "string" } }, required: ["company"], additionalProperties: false },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      const [{ data: riga }, { data: eventi }, tutte] = await Promise.all([
        admin.from("companies").select("id, name, email, phone, vat_number, sector, status, trial_ends_at, payment_method, payment_notes, subscription_plan_id, stripe_subscription_status, created_at, legal_city, subscription_plans(name, price_monthly)").eq("id", az.id).maybeSingle(),
        admin.from("subscription_logs").select("created_at, event_type, old_status, new_status, notes").eq("company_id", az.id).order("created_at", { ascending: false }).limit(10),
        chiama(admin, ctx, "home_aziende"),
      ]);
      const metriche = ((tutte ?? []) as Record<string, unknown>[]).find((a) => a.id === az.id) ?? null;
      return { azienda: riga, metriche, ultimi_eventi: eventi ?? [] };
    },
  },
  {
    name: "insoluti",
    description: "Aziende che non hanno pagato: importo dovuto, giorni di ritardo, motivo del fallimento, prossima azione.",
    scope: "platform:read",
    inputSchema: vuoto,
    handler: async (admin) => {
      const { data, error } = await admin.from("v_insoluti")
        .select("azienda, email, stato_azienda, piano, canone_mensile, pagamenti_falliti, motivo_fallimento, giorni_scaduto, fatture_aperte, importo_dovuto, prossima_azione, in_omaggio")
        .order("giorni_scaduto", { ascending: false });
      if (error) throw new ToolError(error.message);
      return {
        insoluti: (data ?? []).map((r) => ({ ...r, importo_dovuto: Number(r.importo_dovuto ?? 0) / 100 })),
        nota: "importo_dovuto in euro.",
      };
    },
  },
  {
    name: "lista_piani",
    description: "Piani di abbonamento attivi con prezzo, giorni di prova e quante aziende li usano.",
    scope: "platform:read",
    inputSchema: vuoto,
    handler: async (admin) => {
      const [{ data: piani }, { data: aziende }] = await Promise.all([
        admin.from("subscription_plans").select("id, name, slug, price_monthly, price_yearly, trial_days, max_users, monthly_free_ai_eur")
          .eq("is_active", true).is("produttore_id", null).order("position"),
        admin.from("companies").select("subscription_plan_id").is("deleted_at", null).neq("id", PLATFORM_COMPANY_ID),
      ]);
      const conta = new Map<string, number>();
      for (const a of aziende ?? []) if (a.subscription_plan_id) conta.set(a.subscription_plan_id, (conta.get(a.subscription_plan_id) ?? 0) + 1);
      return { piani: (piani ?? []).map((p) => ({ ...p, aziende: conta.get(p.id) ?? 0 })) };
    },
  },
  {
    name: "salute_piattaforma",
    description: "Salute tecnica: job pianificati falliti, funzioni lente, errori raggruppati delle ultime ore.",
    scope: "platform:read",
    inputSchema: { type: "object", properties: { ore: { type: "integer", minimum: 1, maximum: 168 } }, additionalProperties: false },
    handler: async (admin, ctx, args) => {
      const ore = intLimit(args.ore, 24, 168);
      const [salute, errori] = await Promise.all([chiama(admin, ctx, "salute"), chiama(admin, ctx, "errori", { ore, limite: 30 })]);
      return { salute, errori_raggruppati: errori };
    },
  },
  {
    name: "registro_attivita",
    description: "Registro delle attività della piattaforma (chi ha fatto cosa): filtro per azienda, testo, periodo.",
    scope: "platform:read",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, cerca: { type: "string" },
        dal: { type: "string", description: "YYYY-MM-DD" }, al: { type: "string", description: "YYYY-MM-DD" },
        limite: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const companyId = str(args.company) ? (await aziendaCliente(admin, args.company)).id : null;
      const giorno = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      return { voci: await chiama(admin, ctx, "audit", {
        company_id: companyId, cerca: str(args.cerca), limite: intLimit(args.limite, 30, 100),
        dal: giorno(args.dal), al: giorno(args.al) ? `${giorno(args.al)}T23:59:59Z` : null,
      }) };
    },
  },

  {
    name: "aziende_a_rischio",
    description: "Customer success: prove che scadono nei prossimi giorni, aziende attive o in prova che non entrano da tempo, aziende con pagamenti falliti. Per decidere chi chiamare oggi.",
    scope: "platform:read",
    inputSchema: {
      type: "object",
      properties: {
        giorni_prova: { type: "integer", minimum: 1, maximum: 60, description: "Prove in scadenza entro N giorni (default 7)" },
        giorni_inattivita: { type: "integer", minimum: 3, maximum: 120, description: "Nessun accesso da N giorni (default 14)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const giorniProva = intLimit(args.giorni_prova, 7, 60);
      const giorniInattivi = intLimit(args.giorni_inattivita, 14, 120);
      const ora = Date.now();
      const entro = new Date(ora + giorniProva * 86400000).toISOString();
      const [tutte, { data: prove }, { data: insoluti }] = await Promise.all([
        chiama(admin, ctx, "home_aziende"),
        admin.from("companies").select("id, name, trial_ends_at, subscription_plans(name)").eq("status", "trial")
          .is("deleted_at", null).lte("trial_ends_at", entro).order("trial_ends_at"),
        admin.from("v_insoluti").select("azienda, piano, giorni_scaduto, importo_dovuto, prossima_azione").order("giorni_scaduto", { ascending: false }),
      ]);
      const inattive = ((tutte ?? []) as Record<string, unknown>[])
        .filter((a) => ["active", "trial"].includes(String(a.stato)))
        .filter((a) => !a.ultimo_accesso || ora - Date.parse(String(a.ultimo_accesso)) > giorniInattivi * 86400000)
        .map((a) => ({ azienda: a.nome, stato: a.stato, piano: a.piano, ultimo_accesso: a.ultimo_accesso ?? "mai", utenti: a.utenti_totali }));
      return {
        prove_in_scadenza: (prove ?? []).map((p) => ({ azienda: p.name, scade: p.trial_ends_at, piano: (p.subscription_plans as { name?: string } | null)?.name ?? null })),
        inattive,
        pagamenti_falliti: (insoluti ?? []).map((r) => ({ ...r, importo_dovuto: Number(r.importo_dovuto ?? 0) / 100 })),
      };
    },
  },
  {
    name: "assistenza_aperta",
    description: "Chat di assistenza delle aziende ancora aperte: ultimo messaggio, chi aspetta risposta, scadenze SLA superate.",
    scope: "platform:read",
    inputSchema: vuoto,
    handler: async (admin) => {
      const { data: conversazioni, error } = await admin.from("support_conversations")
        .select("id, company_id, status, priority, created_at, updated_at, sla_response_breached, sla_resolution_breached, companies(name)")
        .is("resolved_at", null).order("updated_at", { ascending: false }).limit(50);
      if (error) throw new ToolError(error.message);
      const elenco = await Promise.all((conversazioni ?? []).map(async (c) => {
        const { data: ultimi } = await admin.from("support_messages").select("sender_role, message, created_at")
          .eq("company_id", c.company_id).order("created_at", { ascending: false }).limit(3);
        const ultimo = ultimi?.[0];
        return {
          azienda: (c.companies as { name?: string } | null)?.name ?? c.company_id,
          priorita: c.priority, aperta_il: c.created_at,
          aspetta_risposta: !!ultimo && !/admin|support|staff|platform/i.test(String(ultimo.sender_role ?? "")),
          sla_superato: c.sla_response_breached === true || c.sla_resolution_breached === true,
          ultimi_messaggi: (ultimi ?? []).map((m) => ({ da: m.sender_role, quando: m.created_at, testo: String(m.message ?? "").slice(0, 400) })),
        };
      }));
      return { aperte: elenco.length, conversazioni: elenco };
    },
  },

  // ── Azioni ────────────────────────────────────────────────────────────────
  {
    name: "crea_azienda",
    description: "Crea un'azienda cliente con il suo amministratore e manda l'email di benvenuto con le credenziali. Mostra prima tutti i dati all'utente e chiedi conferma.",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" }, email_azienda: { type: "string" },
        settore: { type: "string", enum: ["serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro"] },
        email_amministratore: { type: "string" }, nome_amministratore: { type: "string" }, cognome_amministratore: { type: "string" },
        piano: { type: "string", description: "Nome, slug o UUID del piano (lista_piani)" },
        partita_iva: { type: "string" }, telefono: { type: "string" }, ragione_sociale: { type: "string" },
      },
      required: ["nome", "email_azienda", "settore", "email_amministratore"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const piano = str(args.piano) ? await pianoDa(admin, args.piano) : null;
      const esito = await esitoDa(await creaAzienda(admin, {
        companyName: str(args.nome), companyEmail: str(args.email_azienda), sector: str(args.settore),
        adminEmail: str(args.email_amministratore), adminFirstName: str(args.nome_amministratore),
        adminLastName: str(args.cognome_amministratore), planId: piano?.id ?? null,
        vatNumber: str(args.partita_iva), phone: str(args.telefono), businessName: str(args.ragione_sociale),
        inviaBenvenuto: true,
      }));
      const azienda = esito.company as Record<string, unknown> | undefined;
      const credenziali = esito.adminCredentials as Record<string, unknown> | undefined;
      await registra(admin, ctx, "create_company", String(azienda?.id ?? ""), { company_name: azienda?.name, plan: piano?.name ?? null });
      // La password non passa dall'assistente: è nell'email di benvenuto.
      return {
        creata: true, azienda: { id: azienda?.id, nome: azienda?.name, stato: azienda?.status, prova_fino_al: azienda?.trial_ends_at },
        piano: piano?.name ?? null, amministratore: str(args.email_amministratore),
        email_benvenuto: credenziali?.welcomeEmailStatus ?? "sent",
      };
    },
  },
  {
    name: "cambia_stato_azienda",
    description: "Sospende, riattiva o cambia lo stato di un'azienda (active, suspended, trial, expired, free). Chiedi conferma prima.",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, stato: { type: "string", enum: ["active", "suspended", "trial", "expired", "free"] },
        note: { type: "string", description: "Motivo" },
      },
      required: ["company", "stato"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      return await chiama(admin, ctx, "cambia_stato", { company_id: az.id, stato: str(args.stato), note: str(args.note) });
    },
  },
  {
    name: "proroga_prova",
    description: "Proroga il periodo di prova di un'azienda di N giorni (da oggi se la prova è già scaduta).",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, giorni: { type: "integer", minimum: 1, maximum: 365 } },
      required: ["company", "giorni"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      return await chiama(admin, ctx, "proroga_prova", { company_id: az.id, giorni: num(args.giorni) });
    },
  },
  {
    name: "cambia_piano",
    description: "Cambia il piano di abbonamento di un'azienda (aggiorna anche Stripe se c'è un abbonamento). Chiedi conferma prima.",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, piano: { type: "string" }, motivo: { type: "string" } },
      required: ["company", "piano"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      const piano = await pianoDa(admin, args.piano);
      const esito = await esitoDa(await changeCompanyPlan(admin, ctx.created_by, {
        company_id: az.id, new_plan_id: piano.id, motivo: str(args.motivo) ?? "Cambio piano dall'assistente AI",
      }));
      await registra(admin, ctx, "change_plan", az.id, { company_name: az.name, plan: piano.name });
      return { azienda: az.name, piano: piano.name, ...esito };
    },
  },
  {
    name: "regala_piano",
    description: "Regala un piano a un'azienda: piano assegnato, pagamento «regalato» (fuori dal MRR), azienda attiva. Serve il motivo; scadenza opzionale.",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, piano: { type: "string" }, motivo: { type: "string" },
        scadenza: { type: "string", description: "YYYY-MM-DD, opzionale" },
      },
      required: ["company", "piano", "motivo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      const piano = await pianoDa(admin, args.piano);
      const scadenza = typeof args.scadenza === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.scadenza) ? args.scadenza : null;
      return await chiama(admin, ctx, "regala_piano", { company_id: az.id, plan_id: piano.id, motivo: str(args.motivo), scadenza });
    },
  },
  {
    name: "aggiungi_crediti_ai",
    description: "Aggiunge (o toglie, con importo negativo) credito in euro al portafoglio di un'azienda: AI, email, WhatsApp. Massimo 500 € per volta. Serve il motivo.",
    scope: "platform:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        importo_eur: { type: "number", minimum: -500, maximum: 500 },
        motivo: { type: "string" },
      },
      required: ["company", "importo_eur", "motivo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await aziendaCliente(admin, args.company);
      const importo = num(args.importo_eur);
      const motivo = str(args.motivo);
      if (importo == null || importo === 0 || Math.abs(importo) > 500) throw new ToolError("Importo fra -500 e 500 €, diverso da zero");
      if (!motivo) throw new ToolError("Motivo obbligatorio");
      const { data, error } = await admin.rpc("adjust_credits_atomic", {
        p_company_id: az.id, p_service: "ai_agents", p_amount: importo, p_reason: motivo, p_adjusted_by: ctx.created_by,
      });
      if (error) throw new ToolError(error.message);
      const esito = (data ?? {}) as Record<string, unknown>;
      if (esito.error) throw new ToolError(String(esito.error));
      await registra(admin, ctx, "adjust_credits", az.id, { company_name: az.name, amount_eur: importo, reason: motivo });
      return { azienda: az.name, importo_eur: importo, saldo_prima: esito.balance_before, saldo_dopo: esito.balance_after };
    },
  },
];

export const PLATFORM_TOOLS: ToolDef[] = STRUMENTI.map(conSuperadmin);

export const ISTRUZIONI_PIATTAFORMA = `Sei collegato all'AREA SUPERADMIN di Edilizia in Cloud: lavori per il titolare della piattaforma, non per un'azienda.
- Numeri del business: statistiche_piattaforma, andamento_mrr, insoluti, lista_piani, aziende_piattaforma, scheda_azienda_piattaforma.
- Salute tecnica e registro: salute_piattaforma, registro_attivita.
- Clienti da seguire: aziende_a_rischio (prove in scadenza, inattive, pagamenti falliti), assistenza_aperta.
- Azioni su aziende e piani (chiedono conferma): crea_azienda, cambia_stato_azienda, proroga_prova, cambia_piano, regala_piano, aggiungi_crediti_ai.
- CRM, calendario ed email del superadmin: usa gli strumenti di contatti/opportunità/attività con company="piattaforma".
- Gestionale di un'azienda cliente: gli stessi strumenti con company=<nome o UUID dell'azienda>.
Prima di ogni azione che cambia piani, stato, crediti o crea un'azienda, riepiloga cosa farai e chiedi conferma.`;
