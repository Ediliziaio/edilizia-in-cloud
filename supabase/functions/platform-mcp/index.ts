// ═══════════════════════════════════════════════════════════════════════════
// platform-mcp — Server MCP nativo di Edilizia in Cloud
//
// Espone la piattaforma come server MCP (Model Context Protocol, transport
// Streamable HTTP stateless) così Claude Code / Claude Desktop / qualsiasi
// client MCP può operare direttamente: creare contatti, opportunità, attività,
// inviare email, leggere commesse e statistiche. Niente token esterni: le
// chiavi sono emesse e revocate dalla piattaforma (/admin/impostazioni/api-mcp)
// e vivono nella tabella api_keys (hash SHA-256, mai in chiaro).
//
// Autenticazione : header `x-api-key: eic_live_…` (o Authorization: Bearer).
// Ambito         : chiave con company_id → opera SOLO su quell'azienda;
//                  chiave piattaforma (company_id NULL, super admin) → tutte,
//                  passando `company` (nome o UUID) ai tool che lo richiedono.
// Rate limit     : per-minuto e per-giorno dalla riga della chiave.
// Audit          : ogni tools/call → api_usage_log (endpoint = mcp:<tool>).
//
// Config deploy  : verify_jwt = false (l'auth è la API key, non il JWT utente).
//
// Collegamento da Claude Code:
//   claude mcp add edilizia --transport http \
//     https://<ref>.supabase.co/functions/v1/platform-mcp \
//     --header "x-api-key: eic_live_..."
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL = "2025-06-18";
const SERVER_INFO = { name: "edilizia-in-cloud", version: "1.0.0" };

const SERVER_INSTRUCTIONS = `Sei collegato a Edilizia in Cloud, gestionale per imprese edili italiane.
Convenzioni: i tool che operano su dati aziendali accettano il parametro "company" (nome o UUID dell'azienda);
se la chiave API è limitata a una singola azienda il parametro viene ignorato e l'ambito è forzato.
Usa prima "lista_aziende" (se disponibile) per scoprire le aziende, poi opera con gli altri tool.
Valori: gli importi sono in euro (numero), le date in formato YYYY-MM-DD.
Stati opportunità: open | won | lost. Stati attività: da_fare | in_corso | completata.`;

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface KeyCtx {
  id: string;
  company_id: string | null;
  name: string;
  scopes: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  /** Super admin/utente che ha emesso la chiave: le scritture che richiedono
   *  un autore (es. tasks.created_by NOT NULL) vengono attribuite a lui. */
  created_by: string;
}

interface ToolDef {
  name: string;
  description: string;
  scope: string | null; // null = nessuno scope richiesto
  inputSchema: Record<string, unknown>;
  handler: (admin: SupabaseClient, ctx: KeyCtx, args: Record<string, unknown>) => Promise<unknown>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hasScope(ctx: KeyCtx, scope: string | null): boolean {
  if (!scope) return true;
  const scopes = ctx.scopes ?? [];
  if (scopes.includes("*")) return true;
  if (scopes.includes(scope)) return true;
  // "contacts:write" implica anche "contacts:read"
  const [res, action] = scope.split(":");
  return action === "read" && scopes.includes(`${res}:write`);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function intLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.min(Math.max(n > 0 ? n : def, 1), max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Risolve l'azienda su cui operare: chiave scoped → la sua; piattaforma → arg. */
async function resolveCompany(
  admin: SupabaseClient,
  ctx: KeyCtx,
  args: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  if (ctx.company_id) {
    const { data } = await admin.from("companies").select("id, name").eq("id", ctx.company_id).maybeSingle();
    if (!data) throw new ToolError("Azienda della chiave non trovata");
    return data as { id: string; name: string };
  }
  const raw = str(args.company);
  if (!raw) throw new ToolError('Parametro "company" obbligatorio per le chiavi piattaforma (nome o UUID azienda). Usa lista_aziende per scoprirle.');
  if (UUID_RE.test(raw)) {
    const { data } = await admin.from("companies").select("id, name").eq("id", raw).maybeSingle();
    if (!data) throw new ToolError(`Nessuna azienda con id ${raw}`);
    return data as { id: string; name: string };
  }
  const { data: matches } = await admin.from("companies").select("id, name").ilike("name", `%${raw}%`).limit(5);
  if (!matches || matches.length === 0) throw new ToolError(`Nessuna azienda che contenga "${raw}" nel nome`);
  if (matches.length > 1) {
    throw new ToolError(`Più aziende corrispondono a "${raw}": ${matches.map((m) => m.name).join(", ")}. Specifica meglio o usa l'UUID.`);
  }
  return matches[0] as { id: string; name: string };
}

/** Errore "di dominio" da mostrare all'AI (non un bug del server). */
class ToolError extends Error {}

// ── Registry dei tool ────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  {
    name: "guida_piattaforma",
    description: "Spiega come usare questa API: convenzioni, ambiti, elenco capacità. Chiamala se hai dubbi.",
    scope: null,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_admin, ctx) => ({
      piattaforma: "Edilizia in Cloud — gestionale per imprese edili italiane",
      chiave: { nome: ctx.name, ambito: ctx.company_id ? "azienda singola" : "piattaforma (tutte le aziende)", scopes: ctx.scopes },
      convenzioni: SERVER_INSTRUCTIONS,
      tool_disponibili: TOOLS.filter((t) => hasScope(ctx, t.scope)).map((t) => t.name),
    }),
  },
  {
    name: "lista_aziende",
    description: "Elenca le aziende della piattaforma (solo chiavi piattaforma). Filtro opzionale sul nome.",
    scope: "companies:read",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Filtro sul nome (contiene)" } },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      if (ctx.company_id) throw new ToolError("Questa chiave è limitata a una sola azienda: lista_aziende non è disponibile.");
      let q = admin.from("companies").select("id, name, created_at").order("name").limit(50);
      const query = str(args.query);
      if (query) q = q.ilike("name", `%${query}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { aziende: data ?? [], nota: "Passa il nome o l'UUID come parametro 'company' agli altri tool." };
    },
  },
  {
    name: "statistiche_azienda",
    description: "KPI rapidi di un'azienda: contatti, opportunità aperte, commesse, fatturato (imponibile) anno corrente.",
    scope: "stats:read",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Nome o UUID azienda (obbligatorio per chiavi piattaforma)" } },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const year = new Date().getFullYear();
      const [contacts, oppOpen, orders, invoices] = await Promise.all([
        admin.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        admin.from("marketing_opportunities").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open").is("deleted_at", null),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        admin.from("invoices").select("subtotal").eq("company_id", company.id)
          .gte("issue_date", `${year}-01-01`).lt("issue_date", `${year + 1}-01-01`),
      ]);
      const fatturato = (invoices.data ?? []).reduce((s, r) => s + Number((r as { subtotal: number | null }).subtotal ?? 0), 0);
      return {
        azienda: company.name,
        contatti: contacts.count ?? 0,
        opportunita_aperte: oppOpen.count ?? 0,
        commesse: orders.count ?? 0,
        fatturato_imponibile_anno: Math.round(fatturato * 100) / 100,
        anno: year,
      };
    },
  },
  {
    name: "cerca_contatti",
    description: "Cerca contatti CRM per nome, email o telefono. Ritorna id, anagrafica, fonte e città.",
    scope: "contacts:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Testo da cercare in nome/cognome/email/telefono" },
        limit: { type: "number", description: "Max risultati (default 20, max 50)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      let q = admin.from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, city, province, source, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(intLimit(args.limit, 20, 50));
      const query = str(args.query);
      if (query) {
        const like = `%${query.replace(/[,()%_]/g, " ").trim()}%`;
        q = q.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return { azienda: company.name, contatti: data ?? [] };
    },
  },
  {
    name: "crea_contatto",
    description: "Crea un contatto CRM. Provincia/regione vengono arricchite in automatico dalla città.",
    scope: "contacts:write",
    inputSchema: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "Nome (obbligatorio)" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        city: { type: "string" },
        source: { type: "string", description: "Fonte del lead (default: api)" },
        notes: { type: "string" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["first_name"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const first_name = str(args.first_name);
      if (!first_name) throw new ToolError("first_name obbligatorio");
      const { data, error } = await admin.from("marketing_contacts").insert({
        company_id: company.id,
        first_name,
        last_name: str(args.last_name),
        email: str(args.email),
        phone: str(args.phone),
        city: str(args.city),
        source: str(args.source) ?? "api",
        notes: str(args.notes),
      }).select("id, first_name, last_name, email, city, province, region").single();
      if (error) throw error;
      return { creato: true, azienda: company.name, contatto: data };
    },
  },
  {
    name: "lista_opportunita",
    description: "Elenca opportunità di vendita (nome, valore €, stato open/won/lost, contatto).",
    scope: "opportunities:read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "won", "lost"], description: "Filtro stato" },
        query: { type: "string", description: "Filtro sul nome opportunità" },
        limit: { type: "number", description: "Max risultati (default 20, max 50)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      let q = admin.from("marketing_opportunities")
        // Le note non stanno più sull'opportunità: dal 23/09/2026 il campo
        // viene svuotato e il testo finisce nel registro (marketing_contact_notes),
        // da cui si prende l'ultima (ordine e tetto valgono sull'annidata).
        .select("id, name, value, status, source, expected_close_date, created_at, contact:marketing_contacts(first_name, last_name, email), note:marketing_contact_notes(content, created_at)")
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("created_at", { referencedTable: "note", ascending: false })
        .limit(1, { referencedTable: "note" })
        .limit(intLimit(args.limit, 20, 50));
      const status = str(args.status);
      if (status) q = q.eq("status", status);
      const query = str(args.query);
      if (query) q = q.ilike("name", `%${query}%`);
      const { data, error } = await q;
      if (error) throw error;
      // L'annidata torna comunque come elenco: qui è una nota sola.
      const opportunita = (data ?? []).map((riga: Record<string, unknown>) => {
        const { note, ...resto } = riga;
        const ultima = Array.isArray(note) ? note[0] : null;
        return { ...resto, ultima_nota: ultima?.content ?? null, ultima_nota_del: ultima?.created_at ?? null };
      });
      return { azienda: company.name, opportunita };
    },
  },
  {
    name: "crea_opportunita",
    description: "Crea un'opportunità di vendita nella pipeline predefinita. Se passi contact_email e il contatto non esiste, viene creato.",
    scope: "opportunities:write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Titolo opportunità (obbligatorio)" },
        value: { type: "number", description: "Valore stimato in euro" },
        contact_id: { type: "string", description: "UUID contatto esistente" },
        contact_email: { type: "string", description: "In alternativa: email del contatto (creato se non esiste)" },
        contact_name: { type: "string", description: "Nome contatto (usato solo se va creato)" },
        source: { type: "string", description: "Fonte (default: api)" },
        notes: { type: "string" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const name = str(args.name);
      if (!name) throw new ToolError("name obbligatorio");

      // Pipeline + primo stage predefiniti dell'azienda
      const { data: pipeline } = await admin.from("marketing_pipelines")
        .select("id").eq("company_id", company.id).order("created_at").limit(1).maybeSingle();
      if (!pipeline) throw new ToolError(`L'azienda ${company.name} non ha ancora una pipeline: creala dall'app (Marketing → Opportunità).`);
      const { data: stage } = await admin.from("marketing_pipeline_stages")
        .select("id").eq("pipeline_id", pipeline.id).order("position").limit(1).maybeSingle();
      if (!stage) throw new ToolError("La pipeline non ha fasi configurate.");

      // Contatto: id esplicito, oppure lookup/creazione per email
      let contactId = str(args.contact_id);
      const contactEmail = str(args.contact_email);
      if (!contactId && contactEmail) {
        const { data: existing } = await admin.from("marketing_contacts")
          .select("id").eq("company_id", company.id).ilike("email", contactEmail).limit(1).maybeSingle();
        if (existing) {
          contactId = existing.id;
        } else {
          const fullName = str(args.contact_name) ?? contactEmail.split("@")[0];
          const [first, ...rest] = fullName.split(/\s+/);
          const { data: created, error: cErr } = await admin.from("marketing_contacts").insert({
            company_id: company.id, first_name: first, last_name: rest.join(" ") || null,
            email: contactEmail, source: str(args.source) ?? "api",
          }).select("id").single();
          if (cErr) throw cErr;
          contactId = created.id;
        }
      }
      if (!contactId) throw new ToolError("Serve contact_id oppure contact_email per collegare l'opportunità a un contatto.");

      const { data, error } = await admin.from("marketing_opportunities").insert({
        company_id: company.id,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        contact_id: contactId,
        name,
        value: num(args.value),
        source: str(args.source) ?? "api",
        notes: str(args.notes),
      }).select("id, name, value, status").single();
      if (error) throw error;
      return { creata: true, azienda: company.name, opportunita: data };
    },
  },
  {
    name: "aggiorna_opportunita",
    description: "Aggiorna un'opportunità: stato (open/won/lost), valore o note. won_at/lost_at sono gestiti in automatico.",
    scope: "opportunities:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID opportunità (obbligatorio)" },
        status: { type: "string", enum: ["open", "won", "lost"] },
        value: { type: "number" },
        notes: { type: "string" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const id = str(args.id);
      if (!id || !UUID_RE.test(id)) throw new ToolError("id opportunità (UUID) obbligatorio");
      const patch: Record<string, unknown> = {};
      const status = str(args.status);
      if (status) {
        if (!["open", "won", "lost"].includes(status)) throw new ToolError("status deve essere open|won|lost");
        patch.status = status;
      }
      if (num(args.value) !== null) patch.value = num(args.value);
      // Il testo scritto qui diventa una nota datata del registro: lo sposta il
      // trigger nota_scheda_nel_registro, il campo resta vuoto (23/09/2026).
      if (str(args.notes)) patch.notes = str(args.notes);
      if (Object.keys(patch).length === 0) throw new ToolError("Nessun campo da aggiornare (status/value/notes)");
      const { data, error } = await admin.from("marketing_opportunities")
        .update(patch).eq("id", id).eq("company_id", company.id)
        .select("id, name, value, status").maybeSingle();
      if (error) throw error;
      if (!data) throw new ToolError("Opportunità non trovata per questa azienda");
      return { aggiornata: true, opportunita: data };
    },
  },
  {
    name: "lista_attivita",
    description: "Elenca attività/task (titolo, stato da_fare/in_corso/completata, priorità, scadenza).",
    scope: "tasks:read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["da_fare", "in_corso", "completata"] },
        limit: { type: "number", description: "Max risultati (default 20, max 50)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      let q = admin.from("tasks")
        .select("id, title, notes, status, priority, due_date, category, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(intLimit(args.limit, 20, 50));
      const status = str(args.status);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return { azienda: company.name, attivita: data ?? [] };
    },
  },
  {
    name: "crea_attivita",
    description: "Crea un'attività/promemoria (stato iniziale: da_fare).",
    scope: "tasks:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titolo (obbligatorio)" },
        notes: { type: "string" },
        due_date: { type: "string", description: "Scadenza YYYY-MM-DD" },
        priority: { type: "string", enum: ["bassa", "normale", "alta"], description: "Default: normale" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const title = str(args.title);
      if (!title) throw new ToolError("title obbligatorio");
      const due = str(args.due_date);
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new ToolError("due_date deve essere YYYY-MM-DD");
      const { data, error } = await admin.from("tasks").insert({
        company_id: company.id,
        title,
        notes: str(args.notes),
        due_date: due,
        priority: str(args.priority) ?? "normale",
        created_by: ctx.created_by,
      }).select("id, title, status, priority, due_date").single();
      if (error) throw error;
      return { creata: true, azienda: company.name, attivita: data };
    },
  },
  {
    name: "cerca_commesse",
    description: "Cerca commesse/cantieri (codice, descrizione, stato, valore contratto, % avanzamento).",
    scope: "orders:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Testo in codice o descrizione" },
        status: { type: "string", description: "Filtro stato commessa" },
        limit: { type: "number", description: "Max risultati (default 20, max 50)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      let q = admin.from("orders")
        .select("id, order_code, description, status, total_amount, percentuale_avanzamento, work_start_date, work_end_date")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(intLimit(args.limit, 20, 50));
      const query = str(args.query);
      if (query) {
        const like = `%${query.replace(/[,()%_]/g, " ").trim()}%`;
        q = q.or(`order_code.ilike.${like},description.ilike.${like}`);
      }
      const status = str(args.status);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return { azienda: company.name, commesse: data ?? [] };
    },
  },
  {
    name: "invia_email",
    description: "Invia un'email transazionale dalla piattaforma (mittente e deliverability gestiti da Edilizia in Cloud). Usa con criterio: l'invio è reale.",
    scope: "email:send",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Destinatario (email singola)" },
        subject: { type: "string" },
        html: { type: "string", description: "Corpo HTML (in alternativa usa text)" },
        text: { type: "string", description: "Corpo testo semplice" },
        reply_to: { type: "string" },
        company: { type: "string", description: "Nome o UUID azienda per branding/log (chiavi piattaforma: opzionale)" },
      },
      required: ["to", "subject"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const to = str(args.to);
      const subject = str(args.subject);
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ToolError("Destinatario 'to' non valido");
      if (!subject) throw new ToolError("subject obbligatorio");
      const text = str(args.text);
      const html = str(args.html) ?? (text ? `<div style="font-family:sans-serif;white-space:pre-wrap">${
        text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      }</div>` : null);
      if (!html) throw new ToolError("Serve html oppure text come corpo");

      // Azienda per branding/log: obbligatoria per chiavi scoped, opzionale per piattaforma
      let companyId: string | null = ctx.company_id;
      if (!companyId && str(args.company)) {
        companyId = (await resolveCompany(admin, ctx, args)).id;
      }
      const result = await sendEmailUnified({
        companyId,
        stream: "transactional",
        to,
        subject,
        html,
        text: text ?? undefined,
        replyTo: str(args.reply_to) ?? undefined,
        templateName: "platform-mcp",
        adminClient: admin,
        metadata: { via: "platform-mcp", api_key: ctx.name },
      });
      if (!result.ok) throw new ToolError(`Invio fallito: ${JSON.stringify(result.body)}`);
      return { inviata: true, to, subject };
    },
  },
];

// ── JSON-RPC / MCP plumbing ─────────────────────────────────────────────────

type Json = Record<string, unknown>;

function rpcResult(id: unknown, result: unknown): Json {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string): Json {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolToMcp(t: ToolDef) {
  return { name: t.name, description: t.description, inputSchema: t.inputSchema };
}

// ── Server ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Health check senza auth (smoke test/monitoraggio)
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return new Response(JSON.stringify({ ok: true, server: SERVER_INFO.name, tools: TOOLS.length }), { headers: jsonHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Il transport MCP usa POST." }), { status: 405, headers: jsonHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Autenticazione API key ────────────────────────────────────────────────
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = req.headers.get("x-api-key") ?? (bearer?.startsWith("eic_") ? bearer : null);
  if (!apiKey) {
    return new Response(JSON.stringify(rpcError(null, -32001, "API key mancante: header x-api-key (o Authorization: Bearer eic_...)")), { status: 401, headers: jsonHeaders });
  }
  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await admin.from("api_keys")
    .select("id, company_id, name, scopes, is_active, expires_at, rate_limit_per_minute, rate_limit_per_day, created_by")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!keyRow) {
    return new Response(JSON.stringify(rpcError(null, -32001, "API key non valida")), { status: 401, headers: jsonHeaders });
  }
  if (!keyRow.is_active) {
    return new Response(JSON.stringify(rpcError(null, -32001, "API key revocata")), { status: 403, headers: jsonHeaders });
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return new Response(JSON.stringify(rpcError(null, -32001, "API key scaduta")), { status: 403, headers: jsonHeaders });
  }
  const ctx: KeyCtx = {
    id: keyRow.id,
    company_id: keyRow.company_id,
    name: keyRow.name,
    scopes: (keyRow.scopes as string[]) ?? [],
    rate_limit_per_minute: keyRow.rate_limit_per_minute ?? 60,
    rate_limit_per_day: keyRow.rate_limit_per_day ?? 5000,
    created_by: keyRow.created_by,
  };

  // ── Parse JSON-RPC ────────────────────────────────────────────────────────
  let msg: Json;
  try {
    msg = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "JSON non valido")), { status: 400, headers: jsonHeaders });
  }
  if (Array.isArray(msg)) {
    return new Response(JSON.stringify(rpcError(null, -32600, "Batch JSON-RPC non supportato (spec MCP 2025-06-18)")), { status: 400, headers: jsonHeaders });
  }
  const method = msg.method as string | undefined;
  const id = "id" in msg ? msg.id : undefined;
  const params = (msg.params ?? {}) as Json;

  // Notifiche (nessuna risposta attesa) → 202
  if (method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: cors });
  }

  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion as string | undefined;
      const protocolVersion = requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL;
      return new Response(JSON.stringify(rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      })), { headers: jsonHeaders });
    }
    case "ping":
      return new Response(JSON.stringify(rpcResult(id, {})), { headers: jsonHeaders });
    case "tools/list": {
      const visible = TOOLS.filter((t) => hasScope(ctx, t.scope));
      return new Response(JSON.stringify(rpcResult(id, { tools: visible.map(toolToMcp) })), { headers: jsonHeaders });
    }
    case "tools/call": {
      const started = Date.now();
      const toolName = params.name as string | undefined;
      const tool = TOOLS.find((t) => t.name === toolName);
      if (!tool) {
        return new Response(JSON.stringify(rpcError(id, -32602, `Tool sconosciuto: ${toolName}`)), { headers: jsonHeaders });
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>;

      const log = async (status: number, companyId: string | null) => {
        await admin.from("api_usage_log").insert({
          api_key_id: ctx.id,
          company_id: companyId ?? ctx.company_id,
          endpoint: `mcp:${tool.name}`,
          method: "POST",
          status_code: status,
          response_time_ms: Date.now() - started,
          ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        });
      };

      // Scope
      if (!hasScope(ctx, tool.scope)) {
        await log(403, null);
        return new Response(JSON.stringify(rpcResult(id, {
          content: [{ type: "text", text: `Scope '${tool.scope}' non autorizzato per questa chiave.` }],
          isError: true,
        })), { headers: jsonHeaders });
      }

      // Rate limit (minuto + giorno)
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count: minuteCount } = await admin.from("api_usage_log")
        .select("*", { count: "exact", head: true })
        .eq("api_key_id", ctx.id).gte("created_at", oneMinuteAgo);
      if ((minuteCount ?? 0) >= ctx.rate_limit_per_minute) {
        await log(429, null);
        return new Response(JSON.stringify(rpcResult(id, {
          content: [{ type: "text", text: `Rate limit superato (${ctx.rate_limit_per_minute}/min). Riprova tra poco.` }],
          isError: true,
        })), { headers: jsonHeaders });
      }

      try {
        const result = await tool.handler(admin, ctx, args);
        await log(200, typeof (result as Json)?.company_id === "string" ? (result as Json).company_id as string : null);
        await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", ctx.id);
        return new Response(JSON.stringify(rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        })), { headers: jsonHeaders });
      } catch (e) {
        const friendly = e instanceof ToolError;
        await log(friendly ? 422 : 500, null);
        const message = e instanceof Error
          ? e.message
          : (typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : JSON.stringify(e));
        console.error(`[platform-mcp] ${tool.name} failed:`, message);
        return new Response(JSON.stringify(rpcResult(id, {
          content: [{ type: "text", text: friendly ? message : `Errore interno del tool: ${message}` }],
          isError: true,
        })), { headers: jsonHeaders });
      }
    }
    default:
      return new Response(JSON.stringify(rpcError(id, -32601, `Metodo non supportato: ${method}`)), { headers: jsonHeaders });
  }
});
