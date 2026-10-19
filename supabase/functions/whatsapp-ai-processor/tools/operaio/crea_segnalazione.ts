// MP02 — Segnalazione problema cantiere con urgenza.
//
// 18/10/2026: la segnalazione diventa un TICKET, come quello aperto dall'app
// Campo (fonte «campo»), e l'ufficio riceve subito l'avviso: la campanella la
// scrive già il database alla nascita del ticket, qui parte anche la notifica
// sul telefono. Prima finiva in cantiere_segnalazioni e l'«alert al titolare»
// promesso non partiva.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { sceltaCantiere } from "../shared/sceltaCantiere.ts";

export const creaSegnalazioneDef: Omit<ToolDef, "handler"> = {
  name: "crea_segnalazione",
  description:
    "Apre un ticket per un problema o un'anomalia su un cantiere (come «Ticket» nell'app Campo). L'ufficio riceve subito l'avviso.",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string" },
      urgenza: { type: "string", enum: ["alta", "media", "bassa"] },
      tipo_problema: { type: "string", description: "Categoria: sicurezza, qualità, tempistica, materiali, altro" },
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
      photo_urls: { type: "array", items: { type: "string" } },
    },
    required: ["descrizione"],
    additionalProperties: false,
  },
  requires_grants: ["segnalazione.write"],
};

interface Args {
  descrizione: string;
  urgenza?: "alta" | "media" | "bassa";
  tipo_problema?: string;
  order_id?: string;
  cantiere_hint?: string;
  photo_urls?: string[];
}

// Urgenza dell'operaio → priorità del ticket (stessi valori dell'app Campo).
const PRIORITA: Record<string, { priorita: string; priority: string }> = {
  alta: { priorita: "alta", priority: "alta" },
  media: { priorita: "media", priority: "normale" },
  bassa: { priorita: "bassa", priority: "bassa" },
};

export async function creaSegnalazione(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string; urgenza: string }>> {
  const descrizione = (args.descrizione ?? "").trim();
  if (descrizione.length < 3) {
    return errResult(
      "descrizione_troppo_breve",
      "Dimmi meglio cosa succede (3+ caratteri).",
    );
  }

  // Il cantiere: quello indicato, oppure il più probabile (dove è oggi). Non è
  // obbligatorio: un problema senza cantiere arriva lo stesso all'ufficio.
  let orderId = args.order_id ?? null;
  let motivo: string | null = null;
  if (!orderId) {
    const scelta = await sceltaCantiere(ctx, { hint: args.cantiere_hint ?? null }).catch((): null => null);
    if (scelta?.proposto) { orderId = scelta.proposto.id; motivo = scelta.proposto.motivo; }
  }

  const urgenza = args.urgenza ?? "media";
  const priorita = PRIORITA[urgenza] ?? PRIORITA.media;
  const [{ data: ordine }, { data: dip }] = await Promise.all([
    orderId
      ? ctx.supabase.from("orders").select("order_code, description").eq("company_id", ctx.company_id).eq("id", orderId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.employee_id
      ? ctx.supabase.from("employees").select("first_name, last_name").eq("company_id", ctx.company_id).eq("id", ctx.employee_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const cantiere = [ordine?.order_code, ordine?.description].filter(Boolean).join(" · ");
  const chi = [dip?.first_name, dip?.last_name].filter(Boolean).join(" ") || "un operaio";
  const breve = descrizione.length > 80 ? `${descrizione.slice(0, 79)}…` : descrizione;
  const titolo = `${cantiere ? `${ordine?.order_code ?? cantiere}: ` : ""}${breve}`.slice(0, 200);
  const fotoNote = ctx.mediaCorrente?.tipo === "image" ? "\nFoto: allegata al messaggio WhatsApp (in Conversazioni)." : "";

  const { data: ticket, error } = await ctx.supabase
    .from("tickets")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId,
      created_by: ctx.user_id,
      // I ticket dal campo non hanno un cliente (come quelli dell'app Campo).
      customer_id: null,
      subject: titolo,
      titolo,
      descrizione,
      priorita: priorita.priorita,
      priority: priorita.priority,
      status: "aperto",
      fonte: "campo",
      ...(args.tipo_problema ? { category: args.tipo_problema.slice(0, 60) } : {}),
      internal_notes: `Arrivato su WhatsApp da ${chi} (${ctx.phone}).${fotoNote}`,
    })
    .select("id")
    .single();

  if (error || !ticket?.id) return errResult("ticket_non_creato", "Non sono riuscito ad aprire la segnalazione. Riprova, oppure chiama l'ufficio se è urgente.");

  await avvisaUfficio(ctx, ticket.id, `${urgenza === "alta" ? "Urgente: " : ""}problema dal cantiere`,
    `${chi}${cantiere ? ` su ${cantiere}` : ""}: ${breve}`).catch((): undefined => undefined);

  const emoji = urgenza === "alta" ? "🔴" : urgenza === "media" ? "🟠" : "🟡";
  const dove = cantiere ? ` su ${cantiere}${motivo ? ` (${motivo})` : ""}` : "";
  return okResult({ id: ticket.id, urgenza },
    `${emoji} Segnalazione aperta${dove}. L'ufficio l'ha ricevuta adesso.`);
}

/**
 * La notifica sul telefono a chi in ufficio ha l'app installata e non è in
 * silenzio, con le stesse regole delle notifiche dell'app (tg_notifica_push).
 */
async function avvisaUfficio(ctx: ToolCtx, ticketId: string, titolo: string, testo: string): Promise<void> {
  // Prima chi in piattaforma ha un ruolo d'ufficio (poche centinaia), poi chi di
  // loro è di questa azienda: user_roles non ha l'azienda, e un elenco di tutte
  // le persone dell'azienda renderebbe la lettura troppo lunga.
  const { data: ruoli } = await ctx.supabase.from("user_roles").select("user_id")
    .in("role", ["company_admin", "company_staff"]);
  const conRuolo = [...new Set(((ruoli ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))];
  if (conRuolo.length === 0) return;
  const { data: persone } = await ctx.supabase.from("profiles").select("id")
    .eq("company_id", ctx.company_id).in("id", conRuolo);
  const ufficio = ((persone ?? []) as Array<{ id: string }>).map((p) => p.id);
  for (const id of ufficio) {
    const [{ data: dispositivi }, { data: silenzio }] = await Promise.all([
      ctx.supabase.rpc("utente_ha_dispositivi", { p_user: id }),
      ctx.supabase.rpc("utente_in_silenzio", { p_user: id }),
    ]);
    if (dispositivi !== true || silenzio === true) continue;
    const { data: link } = await ctx.supabase.rpc("link_notifica_per_utente", { p_user: id, p_url: `/azienda/assistenza/${ticketId}` });
    await ctx.supabase.rpc("campo_push_invia", {
      p_user_ids: [id], p_title: titolo, p_body: testo,
      p_url: typeof link === "string" && link ? link : `/azienda/assistenza/${ticketId}`, p_tag: `campo_ticket:${ticketId}`,
    });
  }
}
