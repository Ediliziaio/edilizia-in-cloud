import { aiRequestHash } from "../_shared/aiRequestGuard.ts";
import type { ConfermaAttesa } from "../_shared/botOperativoConferme.ts";
import type { ToolCtx } from "./tools/shared/types.ts";
import { resolveCantiere } from "./tools/shared/resolve_cantiere.ts";
import { requireSiteAccess } from "./tools/shared/siteAccess.ts";
import { buildInteractivePayload } from "./interactive.ts";
import { isEdileDraftModel, validEdileReview } from "../_shared/edileQuoteDraft.ts";

/** Only messages constructed here are safe to expose, never raw DB errors. */
export class ConfirmationReviewError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ConfirmationReviewError"; }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || (typeof value === "number" && !Number.isFinite(value))) throw new Error("invalid_confirmation_data");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function confirmationHash(action: string, args: Record<string, unknown>, media: unknown): Promise<string> {
  return aiRequestHash(canonicalJson({ action, args, media: media ?? null }));
}

const names: Record<string, string> = {
  crea_rapportino: "Registrare il rapportino", aggiungi_attivita_rapportino: "Aggiungere attività al rapportino",
  registra_presenza: "Registrare la presenza", carica_ddt: "Registrare il DDT", carica_scontrino: "Registrare la spesa",
  approva_richiesta: "Gestire la richiesta", invia_pdf_preventivo: "Inviare il preventivo", crea_preventivo_ai: "Creare il preventivo",
  salva_preventivo_bozza: "Salvare le voci approvate del preventivo",
  invia_preventivo_bagno: "Creare il progetto bagno dal modello verificato",
  prepara_preventivo_modello: "Salvare la bozza nel preventivatore dedicato (non inviare PDF)",
  genera_pdf_modello_bagno: "Generare il PDF del modello bagno",
  invia_pdf_modello_bagno: "Inviare il PDF verificato al tuo WhatsApp (non al cliente)",
};
const labels: Record<string, string> = {
  artifact_id: "Ricevuta PDF", progetto_id: "Progetto", modello: "Modello",
  revisione_progetto: "Versione del progetto", revisione_modello: "Versione del modello",
  revisione_preventivo: "Versione del preventivo", quote_id: "Preventivo", quote_numero: "Numero preventivo",
  modulo: "Preventivatore", impronta_preventivo: "Verifica delle voci", impronta_modello: "Verifica del modello",
  documento_verificato: "PDF controllato da te", client_name: "Cliente", items: "Voci approvate",
};

/** Complete preview, never a silently truncated approval. */
export function confirmationPreview(action: string, args: Record<string, unknown>, siteName?: string, media?: ToolCtx["mediaCorrente"], quoteReview?: Record<string, unknown>): string {
  if (action === "prepara_preventivo_modello" && quoteReview) {
    const money = (n: unknown) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
    const items = quoteReview.voci_da_mostrare as Record<string, unknown>[];
    const lines = [names[action], `Cliente: ${String(quoteReview.cliente ?? "Da completare nell’app")}`,
      `Modello: ${String(args.modulo)}/${String(args.modello)}`, `Preventivo: ${String(quoteReview.quote_number ?? args.quote_id)}`];
    for (const [i, item] of items.entries()) {
      const text = typeof item.description === "string" && item.description.trim() ? item.description : item.name;
      lines.push(`${i + 1}. ${String(text)} — ${String(item.quantity)} ${String(item.unit_of_measure ?? "corpo")} × ${money(item.unit_price)}; IVA ${String(item.vat_rate)}%`);
    }
    lines.push(`Totale: ${money(quoteReview.totale)}`, "Dati tecnici, condizioni e PDF da verificare nell’app. Nessun documento inviato.", "Confermi questa bozza?");
    const preview = lines.join("\n");
    // A partial list must never be presented as the complete approved computo.
    if (preview.length > 1024) throw new ConfirmationReviewError("confirmation_requires_app", "Computo troppo lungo per una conferma WhatsApp completa: verifica e salva nell’app.");
    return preview;
  }
  const lines = [names[action] ?? action.replace(/_/g, " ")];
  for (const [key, value] of Object.entries(args)) {
    if (key === "order_id" && siteName) lines.push(`Cantiere: ${siteName} (${String(value).slice(0, 8)})`);
    else lines.push(`${labels[key] ?? key.replace(/_/g, " ")}: ${typeof value === "boolean" ? (value ? "Sì" : "No") : typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  if (media) lines.push(`Allegato: ${media.storagePath.split("/").pop()}`);
  const preview = lines.join("\n") + "\n\nConfermi questi dati?";
  if (preview.length > 1024) throw new Error("confirmation_preview_too_long");
  return preview;
}

export async function freezeConfirmation(ctx: ToolCtx, action: string, input: Record<string, unknown>, sourceMessageId: string, now = new Date()) {
  const args = JSON.parse(canonicalJson(input)) as Record<string, unknown>;
  let quoteReview: Record<string, unknown> | undefined;
  if (action === "prepara_preventivo_modello") {
    if (!ctx.user_id || !["admin", "ufficio"].includes(ctx.kind) || !isEdileDraftModel(args.modulo, args.modello) || typeof args.quote_id !== "string") {
      throw new ConfirmationReviewError("confirmation_not_available", "Preventivatore non disponibile per questa conferma.");
    }
    const { data, error } = await ctx.supabase.rpc("whatsapp_review_edile_quote", {
      p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_quote_id: args.quote_id,
      p_module: args.modulo, p_model_id: args.modello,
    });
    if (error || !validEdileReview(data, ctx.company_id, args.quote_id, args.modulo, String(args.modello))) {
      throw new ConfirmationReviewError("confirmation_review_unavailable", "Non posso verificare tutte le voci: apri il preventivatore nell’app. Nessuna bozza creata.");
    }
    if (data.revisione_modello !== args.revisione_modello || data.revisione_preventivo !== args.revisione_preventivo ||
      data.impronta_preventivo !== args.impronta_preventivo || data.impronta_modello !== args.impronta_modello) {
      throw new ConfirmationReviewError("confirmation_source_changed", "Voci o modello cambiati: ripeti la verifica prima di chiedere conferma.");
    }
    quoteReview = data;
  }
  if (action === "carica_ddt") delete args.media_url;
  let siteName: string | undefined;
  const siteTools = ["crea_rapportino", "carica_ddt", "carica_scontrino"];
  if (siteTools.includes(action) && !args.order_id && (action !== "carica_scontrino" || args.cantiere)) {
    const hint = args.cantiere_hint ?? args.cantiere;
    const site = await resolveCantiere(ctx, typeof hint === "string" ? hint : undefined);
    if (!site.cantiere_id) throw new Error(site.ask_user ?? "Indica il cantiere da confermare.");
    args.order_id = site.cantiere_id; siteName = site.cantiere_nome ?? undefined;
    delete args.cantiere_hint;
  }
  if (args.order_id) {
    await requireSiteAccess(ctx, String(args.order_id));
    const { data, error } = await ctx.supabase.from("orders").select("id, description, order_code")
      .eq("id", args.order_id).eq("company_id", ctx.company_id).maybeSingle();
    if (error || !data) throw new Error("Cantiere non disponibile per la conferma.");
    siteName = [data.order_code, data.description].filter(Boolean).join(" · ");
  }
  if (action === "crea_rapportino" && !args.data_lavoro) {
    args.data_lavoro = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  }
  if (action === "carica_scontrino" && !args.data) args.data = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  if (action === "registra_presenza") {
    args.ora ??= now.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    args.data_evento = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  }
  const media = ctx.mediaCorrente ?? null;
  const preview = confirmationPreview(action, args, siteName, media, quoteReview);
  const pending: ConfermaAttesa = {
    azione: action, proposta_id: null, chiesta_il: now.toISOString(), numero_id: ctx.waNumberId,
    id: crypto.randomUUID(), parametri: args, media, source_message_id: sourceMessageId,
    payload_hash: await confirmationHash(action, args, media),
  };
  return { pending, interactive: buildInteractivePayload(preview, [
    { id: `approve:${pending.id}`, title: "Sì" }, { id: `reject:${pending.id}`, title: "No" },
  ]) };
}

export function confirmationReplyMatches(pending: ConfermaAttesa | null, metadata: unknown, messageType: string): boolean {
  if (messageType !== "interactive") return true;
  const record = metadata as { interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } } | null;
  const id = record?.interactive?.button_reply?.id ?? record?.interactive?.list_reply?.id;
  return !!pending?.id && (id === `approve:${pending.id}` || id === `reject:${pending.id}`);
}

export async function frozenConfirmationValid(pending: ConfermaAttesa): Promise<boolean> {
  return !!pending.azione && !!pending.parametri && !!pending.payload_hash
    && pending.payload_hash === await confirmationHash(pending.azione, pending.parametri, pending.media);
}
