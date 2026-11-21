import { idWhatsAppValido } from "../../bolleInConversazione.ts";
import { allegatoOperativo } from "../shared/allegatoOperativo.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";
import { errResult, okResult, type ToolCtx, type ToolDef } from "../shared/types.ts";

export const creaAttivitaUfficioDef: Omit<ToolDef, "handler"> = {
  name: "crea_attivita_ufficio",
  description: "Invia una richiesta concreta a un ufficio e la salva in Attività da fare. Usa per richieste di materiale, consegna o intervento. Mostra titolo, ufficio, responsabile e scadenza se indicati.",
  parameters: {
    type: "object",
    properties: {
      ufficio: { type: "string", maxLength: 100, description: "Nome dell'ufficio richiesto, per esempio Acquisti." },
      ufficio_id: { type: "string", description: "Identificato dal gestionale al momento della conferma." },
      responsabile: { type: "string", maxLength: 120, description: "La persona nominata dall'utente, per esempio Laura. Ometti se ha indicato solo un ufficio." },
      assegnatario_id: { type: "string", description: "Identificato dal gestionale al momento della conferma." },
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

async function membriDellUfficio(ctx: ToolCtx, uffici: string[]) {
  const { data, error } = await ctx.supabase.from("ufficio_membri").select("ufficio_id, profile_id")
    .eq("company_id", ctx.company_id).in("ufficio_id", uffici);
  if (error) throw new Error("Non riesco a consultare i responsabili di questi uffici.");
  const membri = data ?? [];
  const ids = [...new Set(membri.map(m => m.profile_id))];
  if (!ids.length) return [];
  const profili = await ctx.supabase.from("profiles").select("id, first_name, last_name, is_blocked")
    .eq("company_id", ctx.company_id).in("id", ids).is("deleted_at", null);
  if (profili.error) throw new Error("Non riesco a verificare i nominativi.");
  const attivi = new Map((profili.data ?? []).filter(p => !p.is_blocked).map(p => [p.id, p]));
  return membri.flatMap(m => {
    const persona = attivi.get(m.profile_id);
    if (!persona) return [];
    const nome = [persona.first_name, persona.last_name].filter(Boolean).join(" ");
    return [{ ...m, nome, primoNome: nomeUfficio(persona.first_name ?? "") }];
  });
}

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
  const persona = typeof args.responsabile === "string" ? nomeUfficio(args.responsabile.slice(0, 120)) : "";
  const corrispondenze = disponibili.filter(a => !nome || nomeUfficio(a.nome) === nome);
  if (persona && corrispondenze.length) {
    const membri = await membriDellUfficio(ctx, corrispondenze.map(a => a.id));
    const trovati = membri.filter(m => nomeUfficio(m.nome) === persona || m.primoNome === persona);
    const area = trovati.length === 1 ? disponibili.find(a => a.id === trovati[0].ufficio_id) : undefined;
    if (!area) {
      const opzioni = trovati.slice(0, 5).map(m => `${m.nome} · ${disponibili.find(a => a.id === m.ufficio_id)?.nome}`).join(" / ");
      throw new Error(opzioni ? `Quale persona? ${opzioni}.` : "Non trovo questa persona negli uffici indicati. Dimmi il nome completo oppure scegli l’ufficio.");
    }
    return { ...campi, ufficio: area.nome as string, ufficio_id: area.id as string,
      responsabile: trovati[0].nome, assegnatario_id: trovati[0].profile_id as string };
  }
  if (corrispondenze.length !== 1) {
    const nomi = disponibili.slice(0, 6).map(a => a.nome).join(", ");
    throw new Error(nomi ? `A quale ufficio va la richiesta? ${nomi}.` : "Chiedi all’amministratore di configurare un ufficio in Attività.");
  }
  return { ...campi, ufficio: corrispondenze[0].nome as string, ufficio_id: corrispondenze[0].id as string,
    responsabile: undefined, assegnatario_id: undefined };
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
    const assegnato = args.assegnatario_id ?? null;
    if (assegnato !== null) {
      if (!idWhatsAppValido(assegnato) || !(await membriDellUfficio(ctx, [area.id])).some(m => m.profile_id === assegnato && m.nome === args.responsabile)) {
        return errResult("responsabile_non_disponibile", "Il responsabile è cambiato. Scegli di nuovo la persona o l’ufficio.");
      }
      if (orderId) {
        const { data, error } = await ctx.supabase.rpc("silvio_commesse_visibili", { p_company_id: ctx.company_id, p_user_id: assegnato });
        if (error || !Array.isArray(data) || !data.some((r: { id: string }) => r.id === orderId)) {
          return errResult("responsabile_senza_commessa", "Questo responsabile non ha accesso alla commessa. Scegli un altro responsabile o l’ufficio.");
        }
      }
    }

    const riga = {
      id: ctx.sourceMessageId, company_id: ctx.company_id, created_by: ctx.user_id, ufficio_id: area.id,
      title: titolo, notes: note || null, status: "da_fare", order_id: orderId, due_date: scadenza, assigned_to: assegnato,
      ...(orderId ? { activity_scope: "ufficio", office_stage: "altro", category: "ordini" } : {}),
    };
    const { data, error } = await ctx.supabase.from("tasks").insert(riga).select("id").maybeSingle();
    let taskId = data?.id;
    if (error?.code === "23505") {
      const esistente = await ctx.supabase.from("tasks").select("id, title, order_id, ufficio_id, due_date, notes, assigned_to")
        .eq("id", riga.id).eq("company_id", ctx.company_id).eq("created_by", ctx.user_id).maybeSingle();
      const t = esistente.data;
      if (!esistente.error && t && t.title === titolo && t.order_id === orderId && t.ufficio_id === area.id &&
        t.due_date === scadenza && t.notes === riga.notes && t.assigned_to === assegnato) taskId = t.id;
    }
    if (!taskId) return errResult("attivita_non_creata", "Non riesco a confermare la creazione. Verifica in Attività.");
    let allegato = "";
    try {
      const file = await allegatoOperativo(ctx, "attivita", taskId);
      if (file) {
        const { error } = await ctx.supabase.from("task_attachments").upsert({ id: file.origine, task_id: taskId,
          company_id: ctx.company_id, file_name: file.nome, storage_path: file.path, mime_type: file.contentType,
          size_bytes: file.dimensione, uploaded_by: ctx.user_id }, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
        allegato = ` ${file.tipoMedia} allegato all’attività.`;
      }
    } catch { allegato = " L’allegato è ancora disponibile nella chat WhatsApp del gestionale."; }
    const aChi = assegnato ? `${args.responsabile} · ${area.nome}` : area.nome;
    return okResult({ id: taskId, ufficio: area.nome, assigned_to: assegnato }, `Attività inviata a ${aChi}.${allegato}\nhttps://app.ediliziaincloud.com/azienda/attivita`);
  } catch {
    return errResult("attivita_non_creata", "Verifica il cantiere e i dati della richiesta prima di inviarla.");
  }
}
