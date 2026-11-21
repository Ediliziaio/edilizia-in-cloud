import { idWhatsAppValido } from "../../bolleInConversazione.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";
import { errResult, okResult, type ToolCtx, type ToolDef } from "../shared/types.ts";

export const creaAttivitaUfficioDef: Omit<ToolDef, "handler"> = {
  name: "crea_attivita_ufficio",
  description: "Invia una richiesta concreta a un ufficio aziendale e la salva in Attività da fare. Usa per richieste di materiale, consegna o intervento all'ufficio. Chiedi conferma con titolo, ufficio e scadenza se l'utente l'ha indicata.",
  parameters: {
    type: "object",
    properties: {
      ufficio: { type: "string", maxLength: 100, description: "Nome dell'ufficio richiesto, per esempio Acquisti." },
      ufficio_id: { type: "string", description: "Identificato dal gestionale al momento della conferma." },
      titolo: { type: "string", maxLength: 160 },
      note: { type: "string", maxLength: 300 },
      scadenza: { type: "string", description: "YYYY-MM-DD, soltanto quando indicata." },
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
    },
    required: ["titolo"],
    additionalProperties: false,
  },
  requires_grants: ["attivita_ufficio.write"],
  requires_confirmation: true,
};

const nomeUfficio = (nome: string) => nome.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/^ufficio\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

function validaCampi(args: Record<string, unknown>) {
  const titolo = typeof args.titolo === "string" ? args.titolo.trim() : "";
  const note = typeof args.note === "string" ? args.note.trim() : "";
  const scadenza = typeof args.scadenza === "string" ? args.scadenza : null;
  if (titolo.length < 3 || titolo.length > 160 || note.length > 300) throw new Error("Indica il lavoro richiesto all’ufficio in poche parole.");
  if (scadenza !== null) {
    const data = new Date(`${scadenza}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scadenza) || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== scadenza) {
      throw new Error("Indica una scadenza valida.");
    }
  }
  return { titolo, note, scadenza };
}

export async function preparaAttivitaUfficio(ctx: ToolCtx, args: Record<string, unknown>) {
  if (!ctx.user_id || !ctx.role_grants.includes("attivita_ufficio.write")) throw new Error("Per inviare attività serve un’utenza collegata al numero WhatsApp.");
  const campi = validaCampi(args);
  const { data, error } = await ctx.supabase.from("company_uffici").select("id, nome")
    .eq("company_id", ctx.company_id).eq("attivo", true).order("sort_order").limit(100);
  if (error) throw new Error("Gli uffici dell’azienda sono momentaneamente indisponibili.");
  const disponibili = data ?? [];
  const nome = typeof args.ufficio === "string" ? nomeUfficio(args.ufficio) : "";
  const corrispondenze = disponibili.filter(a => nome && nomeUfficio(a.nome) === nome);
  if (corrispondenze.length !== 1) {
    const nomi = disponibili.slice(0, 6).map(a => a.nome).join(", ");
    throw new Error(nomi ? `A quale ufficio va la richiesta? ${nomi}.` : "Chiedi all’amministratore di configurare un ufficio in Attività.");
  }
  return { ...campi, ufficio: corrispondenze[0].nome as string, ufficio_id: corrispondenze[0].id as string };
}

export async function creaAttivitaUfficio(ctx: ToolCtx, args: Record<string, unknown>) {
  if (!ctx.user_id || !ctx.role_grants.includes("attivita_ufficio.write") || !idWhatsAppValido(ctx.sourceMessageId) ||
    !idWhatsAppValido(args.ufficio_id) || typeof args.ufficio !== "string") {
    return errResult("attivita_ufficio_non_autorizzata", "Conferma l’attività dal numero associato alla tua utenza.");
  }
  try {
    const { titolo, note, scadenza } = validaCampi(args);
    const orderId = typeof args.order_id === "string" ? args.order_id : null;
    if (orderId) await requireSiteAccess(ctx, orderId);
    const { data: area, error: areaError } = await ctx.supabase.from("company_uffici").select("id, nome")
      .eq("company_id", ctx.company_id).eq("id", args.ufficio_id).eq("nome", args.ufficio).eq("attivo", true).maybeSingle();
    if (areaError || !area) return errResult("ufficio_non_disponibile", "L’ufficio è cambiato. Scegli di nuovo a chi inviare la richiesta.");

    const riga = {
      id: ctx.sourceMessageId, company_id: ctx.company_id, created_by: ctx.user_id, ufficio_id: area.id,
      title: titolo, notes: note || null, status: "da_fare", order_id: orderId, due_date: scadenza, assigned_to: null as string | null,
      ...(orderId ? { activity_scope: "ufficio", office_stage: "altro", category: "ordini" } : {}),
    };
    const { data, error } = await ctx.supabase.from("tasks").insert(riga).select("id").maybeSingle();
    if (error?.code === "23505") {
      const esistente = await ctx.supabase.from("tasks").select("id, title, order_id, ufficio_id, due_date, notes")
        .eq("id", riga.id).eq("company_id", ctx.company_id).eq("created_by", ctx.user_id).maybeSingle();
      const t = esistente.data;
      if (!esistente.error && t && t.title === titolo && t.order_id === orderId && t.ufficio_id === area.id &&
        t.due_date === scadenza && t.notes === riga.notes) return okResult({ id: t.id, ufficio: area.nome }, `L’attività è già in ${area.nome}.`);
    }
    if (error || !data) return errResult("attivita_non_creata", "Non riesco a confermare la creazione. Verifica in Attività.");
    return okResult({ id: data.id, ufficio: area.nome }, `Attività inviata a ${area.nome}. La trovano in Attività da fare.`);
  } catch {
    return errResult("attivita_non_creata", "Verifica il cantiere e i dati della richiesta prima di inviarla.");
  }
}
