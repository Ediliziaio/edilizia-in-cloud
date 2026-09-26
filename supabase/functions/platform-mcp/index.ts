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
import {
  type KeyCtx, type ToolDef, ToolError,
  sha256Hex, hasScope, isSensitiveScope, str, num, intLimit, resolveCompany, UUID_RE,
} from "./lib.ts";
import { SILVIO_TOOLS } from "./silvioTools.ts";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL = "2025-06-18";
const SERVER_INFO = { name: "edilizia-in-cloud", version: "1.0.0" };

const SERVER_INSTRUCTIONS = `Sei collegato a Edilizia in Cloud, gestionale per imprese edili italiane.
Convenzioni: i tool che operano su dati aziendali accettano il parametro "company" (nome o UUID dell'azienda);
se la chiave API è limitata a una singola azienda il parametro viene ignorato e l'ambito è forzato.
Usa prima "lista_aziende" (se disponibile) per scoprire le aziende, poi opera con gli altri tool.
Valori: gli importi sono in euro (numero), le date in formato YYYY-MM-DD.
Stati opportunità: open | won | lost. Stati attività: da_fare | in_corso | completata.`;

// Tipi e helper (KeyCtx, ToolDef, ToolError, resolveCompany, str/num/…) sono in
// ./lib.ts, condivisi con silvioTools.ts.

// ── Registry dei tool ────────────────────────────────────────────────────────

const TOOLS_MANUALI: ToolDef[] = [
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
    name: "crea_commessa",
    description: "Crea una commessa/cantiere come dall'app: numero progressivo dell'azienda, stato iniziale configurato, importo come imponibile. Bastano la descrizione; opzionali numero, importo e aliquota IVA. Cliente, fasi e piano di pagamento si completano poi dall'app.",
    scope: "orders:write",
    inputSchema: {
      type: "object",
      properties: {
        descrizione: { type: "string", description: "Descrizione della commessa (obbligatoria)" },
        numero: { type: "string", description: "Codice commessa (opzionale; se vuoto si usa il prossimo numero dell'azienda)" },
        importo: { type: "number", description: "Imponibile del contratto in euro (opzionale)" },
        iva: { type: "number", description: "Aliquota IVA % (default 22)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["descrizione"],
      additionalProperties: false,
    },
    // Stessa strada dell'app (src/lib/moduli/convertiInCommessa.ts): un inserimento
    // diretto in `orders` lasciava la commessa senza codice e senza stato
    // configurabile, quindi fuori dalle viste per stato.
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const descrizione = str(args.descrizione);
      if (!descrizione) throw new ToolError("descrizione obbligatoria");
      const importo = num(args.importo);
      const totale = importo != null && importo >= 0 ? Math.round(importo * 100) / 100 : 0;
      const iva = num(args.iva);

      let codice = str(args.numero);
      if (!codice) {
        const { data: prossimo, error: errNumero } = await admin.rpc("prossimo_numero_commessa", { p_company_id: company.id });
        if (errNumero) throw new ToolError(`Numero commessa non disponibile: ${errNumero.message}`);
        codice = (prossimo as string | null) ?? null;
      }
      const { data: stato } = await admin.from("order_statuses")
        .select("id").eq("company_id", company.id)
        .order("is_default", { ascending: false }).order("position", { ascending: true })
        .limit(1).maybeSingle();
      if (!stato?.id) throw new ToolError("L'azienda non ha ancora gli stati commessa: impostali nell'app in Commesse → Stati e riprova.");

      const { data: esito, error } = await admin.rpc("create_order_atomic", {
        p_order_data: {
          company_id: company.id,
          order_code: codice,
          description: descrizione,
          total_amount: totale,
          deposit_amount: 0,
          balance_amount: totale,
          payment_type: "standard",
          current_status_id: stato.id,
          vat_rate: iva != null && iva >= 0 && iva <= 100 ? iva : 22,
          internal_notes: "Creata dall'assistente AI (connettore)",
        },
        p_items: [],
        p_salesperson: null,
        p_user_id: ctx.created_by,
        p_installments: [],
      });
      if (error) throw new ToolError(error.message);
      const id = (esito as { id?: string } | null)?.id;
      if (!id) throw new ToolError("La commessa non è stata creata");
      const { data: commessa } = await admin.from("orders")
        .select("id, order_code, description, total_amount, vat_rate, status").eq("id", id).maybeSingle();
      return { creata: true, azienda: company.name, commessa };
    },
  },
  {
    name: "lista_listino",
    description: "Elenca le voci del listino/prezzario dell'azienda (nome, categoria, unità, prezzo di vendita).",
    scope: "products:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Testo nel nome della voce" },
        categoria: { type: "string", description: "Filtro per categoria (es. serramenti, edile, elettrico…)" },
        limit: { type: "number", description: "Max risultati (default 30, max 100)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      let q = admin.from("article_families")
        .select("id, nome, vertical, unit_of_measure, prezzo_base_vendita, vat_rate")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(intLimit(args.limit, 30, 100));
      const query = str(args.query);
      if (query) q = q.ilike("nome", `%${query.replace(/[,()%_]/g, " ").trim()}%`);
      const categoria = str(args.categoria);
      if (categoria) q = q.eq("vertical", categoria);
      const { data, error } = await q;
      if (error) throw error;
      return { azienda: company.name, voci: data ?? [] };
    },
  },
  {
    name: "carica_voce_listino",
    description: "Aggiunge una voce al listino dell'azienda: nome (obbligatorio), categoria, unità di misura e prezzo di vendita.",
    scope: "products:write",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome della voce (obbligatorio)" },
        categoria: { type: "string", description: "Categoria/verticale (es. edile, serramenti, elettrico…); default: generico" },
        unita: { type: "string", description: "Unità di misura (pz, mq, ml, h…); default: pz" },
        prezzo_vendita: { type: "number", description: "Prezzo di vendita in euro" },
        prezzo_acquisto: { type: "number", description: "Prezzo di acquisto/costo in euro (opzionale)" },
        iva: { type: "number", description: "Aliquota IVA % (default 22)" },
        company: { type: "string", description: "Nome o UUID azienda (chiavi piattaforma)" },
      },
      required: ["nome"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const company = await resolveCompany(admin, ctx, args);
      const nome = str(args.nome);
      if (!nome) throw new ToolError("nome obbligatorio");
      const vendita = num(args.prezzo_vendita);
      const acquisto = num(args.prezzo_acquisto);
      const iva = num(args.iva);
      const { data, error } = await admin.from("article_families").insert({
        company_id: company.id,
        vertical: str(args.categoria) ?? "generico",
        nome,
        unit_of_measure: str(args.unita) ?? "pz",
        prezzo_base_vendita: vendita != null && vendita >= 0 ? vendita : null,
        prezzo_base_acquisto: acquisto != null && acquisto >= 0 ? acquisto : null,
        vat_rate: iva != null && iva >= 0 ? iva : 22,
      }).select("id, nome, vertical, unit_of_measure, prezzo_base_vendita, vat_rate").single();
      if (error) throw error;
      return { creata: true, azienda: company.name, voce: data };
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

// Tool scritti a mano + ponte verso il catalogo silvio_tool_* (silvioTools.ts).
const TOOLS: ToolDef[] = [...TOOLS_MANUALI, ...SILVIO_TOOLS];

// Endpoint (mcp:<tool>) degli strumenti SENSIBILI: invii reali e strumenti a
// costo AI. Hanno un tetto giornaliero dedicato (sensitive_actions_per_day),
// contato sulle chiamate riuscite in api_usage_log.
const SENSITIVE_ENDPOINTS = TOOLS.filter((t) => isSensitiveScope(t.scope)).map((t) => `mcp:${t.name}`);

// ── JSON-RPC / MCP plumbing ─────────────────────────────────────────────────

type Json = Record<string, unknown>;

function rpcResult(id: unknown, result: unknown): Json {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string): Json {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Annotazioni MCP. I client le usano per decidere quando chiedere conferma:
 *  ChatGPT tratta come scrittura (e fa confermare) ogni strumento senza
 *  readOnlyHint, anche le semplici letture. */
function annotazioni(t: ToolDef) {
  if (!t.scope || t.scope.endsWith(":read")) return { readOnlyHint: true, openWorldHint: false };
  return {
    readOnlyHint: false,
    // «aggiorna_*» sovrascrive dati esistenti; gli altri strumenti aggiungono soltanto.
    destructiveHint: t.name.startsWith("aggiorna_"),
    idempotentHint: false,
    // Invii reali: il messaggio esce dal gestionale verso persone esterne.
    openWorldHint: isSensitiveScope(t.scope),
  };
}

function toolToMcp(t: ToolDef) {
  return { name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: annotazioni(t) };
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
  // x-api-key: qualunque prefisso (si autentica per hash). Authorization: Bearer:
  // le chiavi piattaforma sono eic_…, quelle emesse dall'azienda sk_… (apiKeyUtils).
  const apiKey = req.headers.get("x-api-key") ?? (/^(eic_|sk_)/.test(bearer ?? "") ? bearer : null);
  if (!apiKey) {
    return new Response(JSON.stringify(rpcError(null, -32001, "API key mancante: header x-api-key (o Authorization: Bearer eic_...)")), { status: 401, headers: jsonHeaders });
  }
  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await admin.from("api_keys")
    .select("id, company_id, name, scopes, is_active, expires_at, rate_limit_per_minute, rate_limit_per_day, sensitive_actions_per_day, created_by")
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
    sensitive_actions_per_day: keyRow.sensitive_actions_per_day ?? 100,
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
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const { count: dayCount } = await admin.from("api_usage_log")
        .select("*", { count: "exact", head: true })
        .eq("api_key_id", ctx.id).gte("created_at", oneDayAgo);
      if ((dayCount ?? 0) >= ctx.rate_limit_per_day) {
        await log(429, null);
        return new Response(JSON.stringify(rpcResult(id, {
          content: [{ type: "text", text: `Limite giornaliero superato (${ctx.rate_limit_per_day}/giorno).` }],
          isError: true,
        })), { headers: jsonHeaders });
      }

      // Tetto giornaliero delle AZIONI SENSIBILI (invii reali, strumenti a costo
      // AI): separato e più basso del limite generale, per contenere costi e
      // abusi. Conta le sensibili RIUSCITE (status 200) di questa chiave nelle
      // ultime 24 h; blocca la prossima se ha già raggiunto il tetto.
      if (isSensitiveScope(tool.scope) && SENSITIVE_ENDPOINTS.length > 0) {
        const { count: sensitiveCount } = await admin.from("api_usage_log")
          .select("*", { count: "exact", head: true })
          .eq("api_key_id", ctx.id)
          .eq("status_code", 200)
          .in("endpoint", SENSITIVE_ENDPOINTS)
          .gte("created_at", oneDayAgo);
        if ((sensitiveCount ?? 0) >= ctx.sensitive_actions_per_day) {
          await log(429, null);
          return new Response(JSON.stringify(rpcResult(id, {
            content: [{ type: "text", text: `Tetto giornaliero di azioni sensibili raggiunto (${ctx.sensitive_actions_per_day}/giorno: invii reali e strumenti a costo AI). Riprova domani o alza il limite della chiave.` }],
            isError: true,
          })), { headers: jsonHeaders });
        }
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
