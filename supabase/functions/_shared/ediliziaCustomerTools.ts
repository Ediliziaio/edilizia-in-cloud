/**
 * ediliziaCustomerTools — gli strumenti "cliente" dell'assistente EiC,
 * condivisi da TUTTI i canali: agente vocale (agent-tools), WhatsApp
 * (whatsapp-ai-processor ramo cliente), widget chat pubblico.
 *
 * Un solo backend, tre canali: la logica di "quando arriva la merce" o
 * "fissa il sopralluogo" vive QUI; i canali aggiungono solo trasporto e auth.
 *
 * Contratto delle risposte: `risposta` è una frase italiana COMPLETA pensata
 * per essere letta a voce o inviata in chat così com'è. Niente markdown,
 * niente importi di commesse/fatture, niente dati di terzi.
 *
 * FIDUCIA SUL NUMERO — regola dura per chi integra:
 *  - voce (caller id di rete) e WhatsApp (wa_id verificato da Meta): il numero
 *    è AUTENTICO → ok strumenti che RIVELANO dati del chiamante
 *    (stato_consegna, stato_preventivo, info_cliente).
 *  - widget web pubblico: il numero è DIGITATO da un anonimo → SOLO gli
 *    strumenti in TOOL_PUBBLICI_SICURI (creano dati, non ne rivelano).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizePhoneForQuery } from "./webhookSecurity.ts";

export interface CustomerToolResult {
  risposta: string;
  [k: string]: unknown;
}

export interface CustomerToolCtx {
  /** Numero del chiamante così come arrivato (per note/ticket). */
  rawPhone: string;
  /** Ultimi 9 caratteri normalizzati per il match, o null se ignoto. */
  suffix: string | null;
  /** created_by di riserva se l'azienda non ha owner/admin in profiles. */
  fallbackCreatedBy?: string | null;
}

export function suffissoTelefono(raw: string): string | null {
  const safe = sanitizePhoneForQuery(raw);
  return safe ? safe.replace(/\+/g, "").slice(-9) : null;
}

export function dataParlata(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

/** "2026-08-06", "06/08/2026", "06-08-2026" → "2026-08-06" (o null). */
export function normalizzaData(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "9", "9:30", "09.30" → "09:30" (o null). */
export function normalizzaOra(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

function slotLiberi(occupati: Set<number>): number[] {
  const liberi: number[] = [];
  for (let h = 8; h < 18; h++) if (!occupati.has(h)) liberi.push(h);
  return liberi;
}

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

/**
 * created_by per i record creati dall'assistente: un admin dell'azienda, poi
 * uno staff. profiles NON ha una colonna role (la query precedente tornava
 * sempre null): l'appartenenza sta in profiles.company_id, il ruolo in
 * user_roles.
 */
export async function profiloPerConto(admin: SupabaseClient, companyId: string, fallback?: string | null): Promise<string | null> {
  const { data: membri } = await admin.from("profiles").select("id").eq("company_id", companyId).limit(50);
  const ids = ((membri ?? []) as Array<{ id: string }>).map((m) => m.id);
  if (ids.length) {
    const { data: ruoli } = await admin
      .from("user_roles").select("user_id, role").in("user_id", ids)
      .in("role", ["company_admin", "company_staff"]);
    const r = (ruoli ?? []) as Array<{ user_id: string; role: string }>;
    const scelto = r.find((x) => x.role === "company_admin")?.user_id ?? r[0]?.user_id ?? null;
    if (scelto) return scelto;
  }
  return fallback ?? null;
}

export async function trovaContattoPerTelefono(admin: SupabaseClient, companyId: string, suffix: string | null) {
  if (!suffix) return null;
  const { data } = await admin
    .from("marketing_contacts")
    .select("id, first_name, last_name")
    .eq("company_id", companyId)
    .ilike("phone", `%${suffix}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// In produzione gli stati dei preventivi convivono in DUE vocaboli (inviata e
// inviato, accettata e accettato...): la mappa precedente conosceva solo il
// femminile e per meta' dei preventivi ripiegava su "e' in lavorazione".
const STATO_PREVENTIVO_PARLATO: Record<string, string> = {
  bozza: "è in preparazione: l'ufficio lo sta ancora completando",
  inviata: "le è stato inviato: controlli la posta, anche nello spam",
  inviato: "le è stato inviato: controlli la posta, anche nello spam",
  visto: "le è stato inviato e risulta aperto: se ha domande posso farla richiamare",
  accettata: "risulta accettato: l'ufficio la contatterà per i prossimi passi",
  accettato: "risulta accettato: l'ufficio la contatterà per i prossimi passi",
  firmato: "risulta firmato: l'ufficio la contatterà per organizzare i lavori",
  rifiutata: "risulta non accettato",
  rifiutato: "risulta non accettato",
  scaduta: "è scaduto: se è ancora interessato possiamo farne preparare uno aggiornato",
  scaduto: "è scaduto: se è ancora interessato possiamo farne preparare uno aggiornato",
  convertita: "è stato confermato ed è diventato un lavoro in corso",
  convertito: "è stato confermato ed è diventato un lavoro in corso",
};
/** Stati in cui un preventivo e' ancora "aperto" per il cliente. */
const STATI_PREVENTIVO_APERTI = ["bozza", "inviata", "inviato", "visto"];

// ── STRUMENTI ────────────────────────────────────────────────────────────────

export async function statoConsegna(admin: SupabaseClient, companyId: string, ctx: CustomerToolCtx): Promise<CustomerToolResult> {
  if (!ctx.suffix) {
    return { risposta: "Per controllare lo stato mi serve il numero di telefono con cui è registrato il lavoro. Può confermarmelo?" };
  }
  const { data: ordini } = await admin
    .from("orders")
    .select("order_code, tipo_lavoro, status, percentuale_avanzamento, expected_date, warehouse_arrival_date, work_start_date")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("status", "in", '("completato","annullato")')
    .ilike("client_phone", `%${ctx.suffix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  const o = ordini?.[0];
  if (!o) {
    return { risposta: "Con questo numero non trovo lavori in corso. Se il lavoro è intestato a un altro numero o a un familiare, posso comunque prendere nota e farla richiamare dall'ufficio." };
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
  return { risposta: pezzi.join(" ") };
}

export async function creaTicketAssistenza(
  admin: SupabaseClient,
  companyId: string,
  ctx: CustomerToolCtx,
  params: { descrizione?: string; nome?: string; urgenza?: string },
): Promise<CustomerToolResult> {
  const descrizione = String(params.descrizione ?? "").trim();
  if (!descrizione) {
    return { risposta: "Per aprire la segnalazione mi descriva il problema in una frase, per favore." };
  }
  const urgente = /urgent|subito|emergenz|perdita|allagament|non funziona/i.test(
    String(params.urgenza ?? "") + " " + descrizione,
  );

  const contact = await trovaContattoPerTelefono(admin, companyId, ctx.suffix);
  let nomeCliente = String(params.nome ?? "").trim();
  if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");

  const titolo = `Assistenza — ${nomeCliente || ctx.rawPhone || "cliente"}`;
  const { data: ticket, error: tErr } = await admin
    .from("tickets")
    .insert({
      company_id: companyId,
      customer_id: contact?.id ?? null,
      titolo,
      subject: titolo,
      descrizione: `${descrizione}\n\n[Aperto dall'assistente AI${ctx.rawPhone ? ` — contatto ${ctx.rawPhone}` : ""}]`,
      priorita: urgente ? "alta" : "media",
      // priority è un ENUM italiano (bassa|normale|alta|urgente) e fonte ha un
      // CHECK (ufficio|campo|cliente|api): valori fuori lista = insert rifiutato
      // in silenzio e fallback che mente ("ho registrato" senza registrare).
      priority: urgente ? "urgente" : "normale",
      fonte: "cliente",
      status: "aperto",
    })
    .select("id")
    .single();

  if (tErr || !ticket) {
    console.error("[CUSTOMER-TOOLS] crea_ticket:", tErr?.message);
    return { risposta: "Ho registrato la sua richiesta e la passo subito all'ufficio, che la ricontatterà in giornata." };
  }

  const rif = String(ticket.id).slice(0, 8).toUpperCase();
  return {
    risposta: `Fatto: ho aperto la segnalazione con riferimento ${rif}${urgente ? ", marcata come urgente" : ""}. Il tecnico la ricontatterà ${urgente ? "il prima possibile" : "entro un giorno lavorativo"}.`,
    ticket_id: ticket.id,
  };
}

export async function disponibilitaGiorno(admin: SupabaseClient, companyId: string, params: { data?: string }): Promise<CustomerToolResult> {
  const dataISO = normalizzaData(String(params.data ?? ""));
  if (!dataISO) {
    return { risposta: "Per quale giorno vuole controllare la disponibilità? Mi dica la data." };
  }
  const liberi = slotLiberi(await orariOccupati(admin, companyId, dataISO));
  if (liberi.length === 0) {
    return { risposta: `Per ${dataParlata(dataISO)} siamo al completo. Vuole provare con un altro giorno?` };
  }
  const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
  return { risposta: `Per ${dataParlata(dataISO)} abbiamo disponibilità ${proposte}. Quale orario preferisce?` };
}

export async function fissaAppuntamento(
  admin: SupabaseClient,
  companyId: string,
  ctx: CustomerToolCtx,
  params: { data?: string; ora?: string; motivo?: string; nome?: string },
): Promise<CustomerToolResult> {
  const dataISO = normalizzaData(String(params.data ?? ""));
  if (!dataISO) {
    return { risposta: "Per fissare l'appuntamento mi serve il giorno. Quando preferisce?" };
  }
  if (dataISO < new Date().toISOString().slice(0, 10)) {
    return { risposta: "Quella data è già passata. Mi indichi un giorno da domani in poi, per favore." };
  }
  const ora = normalizzaOra(String(params.ora ?? ""));
  const occupati = await orariOccupati(admin, companyId, dataISO);

  if (!ora) {
    const liberi = slotLiberi(occupati);
    if (liberi.length === 0) {
      return { risposta: `Per ${dataParlata(dataISO)} siamo al completo. Vuole provare con un altro giorno?` };
    }
    const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
    return { risposta: `Per ${dataParlata(dataISO)} posso proporle ${proposte}. Quale orario va bene?` };
  }

  const oraH = Number(ora.slice(0, 2));
  // Finestra lavorativa: fuori da 7–19 niente prenotazione (e a 23 l'orario di
  // fine diventerebbe "24:00", ora invalida per Postgres → insert rifiutato).
  if (oraH < 7 || oraH > 19) {
    const liberi = slotLiberi(occupati);
    const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
    return {
      risposta: liberi.length > 0
        ? `A quell'ora non facciamo appuntamenti: lavoriamo tra le 8 e le 18. Per ${dataParlata(dataISO)} posso proporle ${proposte}.`
        : `A quell'ora non facciamo appuntamenti e per ${dataParlata(dataISO)} siamo al completo. Proviamo con un altro giorno?`,
    };
  }
  if (occupati.has(oraH)) {
    const liberi = slotLiberi(occupati);
    if (liberi.length === 0) {
      return { risposta: `${dataParlata(dataISO)} alle ${oraH} è già occupato e la giornata è piena. Proviamo con un altro giorno?` };
    }
    const proposte = liberi.slice(0, 3).map((h) => `le ${h}`).join(", ");
    return { risposta: `Alle ${oraH} è già occupato. Lo stesso giorno posso proporle ${proposte}. Quale preferisce?` };
  }

  const contact = await trovaContattoPerTelefono(admin, companyId, ctx.suffix);
  let nomeCliente = String(params.nome ?? "").trim();
  if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const motivo = String(params.motivo ?? "").trim() || "Sopralluogo";
  const creatore = await profiloPerConto(admin, companyId, ctx.fallbackCreatedBy);

  const { data: appt, error: aErr } = await admin
    .from("appointments")
    .insert({
      company_id: companyId,
      created_by: creatore,
      title: `${motivo}${nomeCliente ? ` — ${nomeCliente}` : ""}`,
      appointment_date: dataISO,
      appointment_time: `${ora}:00`,
      appointment_end_time: `${String(oraH + 1).padStart(2, "0")}:${ora.slice(3, 5)}:00`,
      appointment_type: "agente_ai",
      status: "confermato",
      contact_id: contact?.id ?? null,
      description: `Fissato dall'assistente AI${ctx.rawPhone ? ` — contatto ${ctx.rawPhone}` : ""}.`,
    })
    .select("id")
    .single();

  if (aErr || !appt) {
    console.error("[CUSTOMER-TOOLS] fissa_appuntamento:", aErr?.message);
    return { risposta: "Non riesco a confermare in questo momento, ma ho preso nota della sua preferenza: l'ufficio la richiamerà per confermare giorno e orario." };
  }
  return {
    risposta: `Perfetto, appuntamento fissato per ${dataParlata(dataISO)} alle ${oraH}${ora.slice(3, 5) !== "00" ? ` e ${Number(ora.slice(3, 5))}` : ""}. Riceverà conferma dall'ufficio. Posso aiutarla con altro?`,
    appointment_id: appt.id,
  };
}

export async function statoPreventivo(admin: SupabaseClient, companyId: string, ctx: CustomerToolCtx): Promise<CustomerToolResult> {
  if (!ctx.suffix) {
    return { risposta: "Per controllare il preventivo mi serve il numero di telefono con cui è stato richiesto. Può confermarmelo?" };
  }
  const { data: preventivi } = await admin
    .from("quotes")
    .select("quote_number, status, created_at, sent_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .ilike("client_phone", `%${ctx.suffix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  const q = preventivi?.[0];
  if (!q) {
    return { risposta: "Con questo numero non trovo preventivi. Se l'ha richiesto con un altro numero, posso prendere nota e far controllare all'ufficio." };
  }
  const statoParlato = STATO_PREVENTIVO_PARLATO[String(q.status ?? "")] ?? "è in lavorazione";
  const quando = q.sent_at ?? q.created_at;
  return {
    risposta: `Il preventivo ${q.quote_number}, del ${dataParlata(String(quando).slice(0, 10))}, ${statoParlato}. Vuole che le faccia richiamare dall'ufficio per parlarne?`,
  };
}

export async function richiestaRichiamo(
  admin: SupabaseClient,
  companyId: string,
  ctx: CustomerToolCtx,
  params: { motivo?: string; nome?: string; urgenza?: string },
): Promise<CustomerToolResult> {
  const contact = await trovaContattoPerTelefono(admin, companyId, ctx.suffix);
  let nomeCliente = String(params.nome ?? "").trim();
  if (contact && !nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const motivo = String(params.motivo ?? "").trim();
  const urgente = /urgent|subito|oggi|emergenz/i.test(String(params.urgenza ?? "") + " " + motivo);

  const domani = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { error: kErr } = await admin.from("tasks").insert({
    company_id: companyId,
    created_by: await profiloPerConto(admin, companyId, ctx.fallbackCreatedBy),
    title: `Richiamare ${nomeCliente || ctx.rawPhone || "cliente"} (assistente AI)`,
    notes: [
      motivo ? `Motivo: ${motivo}` : null,
      ctx.rawPhone ? `Numero: ${ctx.rawPhone}` : null,
      "Richiesta raccolta dall'assistente AI.",
    ].filter(Boolean).join("\n"),
    due_date: urgente ? new Date().toISOString().slice(0, 10) : domani,
    priority: urgente ? "alta" : "normale", // convenzione italiana dei task (vedi TaskDialog)
    status: "da_fare",
    contact_id: contact?.id ?? null,
  });

  if (kErr) {
    console.error("[CUSTOMER-TOOLS] richiesta_richiamo:", kErr.message);
    return { risposta: "Ho preso nota: la faccio richiamare dall'ufficio il prima possibile." };
  }
  return {
    risposta: urgente
      ? "Ho segnato la richiesta come urgente: l'ufficio la richiamerà oggi stesso a questo numero."
      : "Perfetto, ho lasciato il messaggio all'ufficio: la richiameranno entro domani a questo numero.",
  };
}

export async function infoProdotto(admin: SupabaseClient, companyId: string, params: { prodotto?: string }): Promise<CustomerToolResult> {
  const ricerca = String(params.prodotto ?? "").trim();
  if (!ricerca) {
    return { risposta: "Che prodotto o materiale le interessa? Mi dica il nome." };
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
    return { risposta: `Al momento non trovo "${ricerca}" nel nostro catalogo, ma potremmo comunque procurarlo: vuole che la faccia richiamare da un tecnico per un preventivo?` };
  }
  const nomi = famiglie.map((f) => f.nome).join(", ");
  return {
    risposta: famiglie.length === 1
      ? `Sì, trattiamo ${nomi}. Il prezzo dipende da misure e configurazione: se vuole le fisso un sopralluogo o le faccio preparare un preventivo. Come preferisce?`
      : `Sì, in catalogo abbiamo: ${nomi}. Il prezzo dipende da misure e configurazione: se vuole le fisso un sopralluogo o le faccio preparare un preventivo.`,
  };
}

export async function infoCliente(admin: SupabaseClient, companyId: string, ctx: CustomerToolCtx): Promise<CustomerToolResult> {
  const contact = await trovaContattoPerTelefono(admin, companyId, ctx.suffix);
  const [{ count: nOrdini }, { count: nPreventivi }] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).is("deleted_at", null)
      .not("status", "in", '("completato","annullato")')
      .ilike("client_phone", ctx.suffix ? `%${ctx.suffix}%` : "%NOMATCH%"),
    admin.from("quotes").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).is("deleted_at", null)
      .in("status", STATI_PREVENTIVO_APERTI)
      .ilike("client_phone", ctx.suffix ? `%${ctx.suffix}%` : "%NOMATCH%"),
  ]);

  if (!contact && !nOrdini && !nPreventivi) {
    return { risposta: "Con questo numero non trovo una scheda cliente: probabilmente è il primo contatto. Posso comunque aiutarla o prendere i suoi dati." };
  }
  const nome = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "";
  const pezzi: string[] = [nome ? `Il numero risulta intestato a ${nome}.` : "Il numero risulta già registrato da noi."];
  if (nOrdini) pezzi.push(nOrdini === 1 ? "C'è un lavoro in corso." : `Ci sono ${nOrdini} lavori in corso.`);
  if (nPreventivi) pezzi.push(nPreventivi === 1 ? "C'è un preventivo aperto." : `Ci sono ${nPreventivi} preventivi aperti.`);
  return { risposta: pezzi.join(" ") };
}

// ── SPEC OPENAI + DISPATCHER (per i canali chat con tool calling) ────────────

/** Tool che RIVELANO dati del numero: solo canali con numero autenticato. */
export const TOOL_NUMERO_AUTENTICATO = ["stato_consegna", "stato_preventivo", "info_cliente"] as const;

/** Tool sicuri anche per il widget pubblico (creano dati, non ne rivelano). */
export const TOOL_PUBBLICI_SICURI = ["disponibilita", "fissa_appuntamento", "info_prodotto", "richiesta_richiamo"] as const;

const P = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, required,
});

export const CUSTOMER_TOOL_SPECS = [
  {
    type: "function" as const,
    function: {
      name: "stato_consegna",
      description: "Stato dell'ultima commessa del cliente: merce arrivata in magazzino, avanzamento lavori, fine prevista. Nessun parametro: il numero è quello del mittente.",
      parameters: P({}),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stato_preventivo",
      description: "Stato dell'ultimo preventivo del cliente (in preparazione, inviato, accettato, scaduto). Nessun parametro: il numero è quello del mittente.",
      parameters: P({}),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "info_cliente",
      description: "Riepilogo del mittente nel gestionale: intestatario, lavori e preventivi aperti. Usalo a inizio conversazione se serve capire chi scrive.",
      parameters: P({}),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "disponibilita",
      description: "Orari liberi in agenda per un giorno. Usalo prima di fissare se il cliente non ha un orario preciso.",
      parameters: P({ data: { type: "string", description: "Giorno richiesto, formato AAAA-MM-GG" } }, ["data"]),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fissa_appuntamento",
      description: "Fissa un appuntamento reale in agenda (sopralluogo, consulenza). Se l'orario è occupato la risposta contiene alternative da proporre.",
      parameters: P({
        data: { type: "string", description: "Giorno, formato AAAA-MM-GG" },
        ora: { type: "string", description: "Orario, formato HH:MM" },
        motivo: { type: "string", description: "Motivo breve (es. Sopralluogo infissi)" },
        nome: { type: "string", description: "Nome del cliente, se lo ha detto" },
      }, ["data"]),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crea_ticket",
      description: "Apre una segnalazione di assistenza col racconto del cliente e restituisce il riferimento da comunicare.",
      parameters: P({
        descrizione: { type: "string", description: "Il problema, fedele alle parole del cliente" },
        nome: { type: "string", description: "Nome del cliente, se noto" },
        urgenza: { type: "string", description: "'urgente' se il cliente lo dichiara o è un'emergenza" },
      }, ["descrizione"]),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "richiesta_richiamo",
      description: "Il cliente vuole parlare con una persona: lascia il messaggio all'ufficio che lo richiamerà.",
      parameters: P({
        motivo: { type: "string", description: "Motivo del richiamo" },
        nome: { type: "string", description: "Nome del cliente, se noto" },
        urgenza: { type: "string", description: "'urgente' se serve il richiamo in giornata" },
      }, ["motivo"]),
    },
  },
  {
    type: "function" as const,
    function: {
      name: "info_prodotto",
      description: "Cerca un prodotto o materiale nel listino aziendale e dice se lo trattiamo.",
      parameters: P({ prodotto: { type: "string", description: "Nome del prodotto o materiale" } }, ["prodotto"]),
    },
  },
];

/** Spec filtrate per i canali col numero NON autenticato (widget pubblico). */
export const CUSTOMER_TOOL_SPECS_PUBBLICHE = CUSTOMER_TOOL_SPECS.filter((t) =>
  (TOOL_PUBBLICI_SICURI as readonly string[]).includes(t.function.name)
);

/** Dispatcher unico: name+args (dall'LLM) → esecuzione. */
export async function eseguiCustomerTool(
  admin: SupabaseClient,
  companyId: string,
  ctx: CustomerToolCtx,
  name: string,
  args: Record<string, unknown>,
): Promise<CustomerToolResult> {
  const s = (k: string) => (args[k] == null ? undefined : String(args[k]));
  switch (name) {
    case "stato_consegna": return statoConsegna(admin, companyId, ctx);
    case "stato_preventivo": return statoPreventivo(admin, companyId, ctx);
    case "info_cliente": return infoCliente(admin, companyId, ctx);
    case "disponibilita": return disponibilitaGiorno(admin, companyId, { data: s("data") });
    case "fissa_appuntamento":
      return fissaAppuntamento(admin, companyId, ctx, { data: s("data"), ora: s("ora"), motivo: s("motivo"), nome: s("nome") });
    case "crea_ticket":
      return creaTicketAssistenza(admin, companyId, ctx, { descrizione: s("descrizione"), nome: s("nome"), urgenza: s("urgenza") });
    case "richiesta_richiamo":
      return richiestaRichiamo(admin, companyId, ctx, { motivo: s("motivo"), nome: s("nome"), urgenza: s("urgenza") });
    case "info_prodotto": return infoProdotto(admin, companyId, { prodotto: s("prodotto") });
    default:
      return { risposta: "Operazione non disponibile. Posso controllare consegne e preventivi, fissare un appuntamento o aprire una segnalazione." };
  }
}
