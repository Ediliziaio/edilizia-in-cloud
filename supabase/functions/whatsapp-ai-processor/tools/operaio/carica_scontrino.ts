// Scontrino/ricevuta dell'operaio → piccola spesa sulla commessa (28/09/2026).
//
// L'operaio fotografa lo scontrino della ferramenta; il modello legge importo,
// esercente e data dalla foto (già letta all'arrivo) e chiama questo tool, che
// registra un'USCITA in Prima Nota. Se dice il cantiere, la si aggancia.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";
import { nomeDelCantiere, registraMerceDaWhatsApp } from "./merceDaWhatsApp.ts";

interface Args {
  importo?: number;
  esercente?: string;
  data?: string;
  cantiere?: string;
  order_id?: string;
  categoria?: string;
  pagato_da?: "operaio" | "azienda";
}

export const caricaScontrinoDef = {
  name: "carica_scontrino",
  description:
    "Registra la spesa di uno scontrino/ricevuta (es. ferramenta) come USCITA in Prima Nota. " +
    "Leggi importo, esercente e data dalla foto ricevuta. Se l'utente indica il cantiere, passalo. " +
    "Serve almeno l'importo. Il riepilogo (importo ed esercente) e la conferma coi bottoni li mostra il sistema: non riscriverli a parole prima.",
  parameters: {
    type: "object",
    properties: {
      importo: { type: "number", description: "Totale pagato in euro — OBBLIGATORIO" },
      esercente: { type: "string", description: "Nome del negozio/fornitore sullo scontrino" },
      data: { type: "string", description: "Data YYYY-MM-DD (o gg/mm/aaaa); se assente oggi" },
      cantiere: { type: "string", description: "Cantiere/commessa di destinazione, se indicato (nome o codice)" },
      order_id: { type: "string", description: "ID della commessa verificata nella conferma" },
      categoria: { type: "string", description: "Categoria di spesa (default 'Materiali cantiere')" },
      pagato_da: {
        type: "string", enum: ["operaio", "azienda"],
        description: "Chi l'ha pagato: «operaio» se l'ha pagato lui (gli va rimborsato), «azienda» se carta o conto dell'azienda. Per l'operaio è obbligatorio: chiediglielo se non l'ha detto.",
      },
    },
    required: ["importo"],
  },
  requires_grants: ["spese.write"],
  requires_confirmation: true,
};

function toIso(s: unknown): string | null {
  const t = String(s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const g = m[1].padStart(2, "0"), me = m[2].padStart(2, "0");
    const a = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${a}-${me}-${g}`;
  }
  return null;
}

export async function caricaScontrino(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  const importo = Math.round((Number(args.importo) || 0) * 100) / 100;
  if (!Number.isFinite(importo) || importo <= 0) return errResult("importo", "Quanto hai speso? Dimmi l'importo dello scontrino.");
  const esercente = String(args.esercente ?? "").trim().slice(0, 120);
  const dataIso = toIso(args.data) ?? new Date().toISOString().slice(0, 10);
  const categoria = String(args.categoria ?? "").trim().slice(0, 60) || "Materiali cantiere";

  // Operaio (18/10/2026): lo scontrino va in «Merce presa» come dall'app Campo:
  // l'ufficio lo verifica e diventa costo della commessa e, se l'ha pagato lui,
  // il suo rimborso. Ufficio e amministratore restano sulla Prima Nota.
  if (ctx.kind === "operaio") {
    if (!args.order_id) return errResult("site_missing", "Su quale cantiere va lo scontrino? Rimandami la foto e scegli il cantiere.");
    if (args.pagato_da !== "operaio" && args.pagato_da !== "azienda") return errResult("pagato_da", "L'hai pagato tu (te lo rimborsano) o con la carta dell'azienda?");
    const esito = await registraMerceDaWhatsApp(ctx, {
      orderId: args.order_id,
      modalita: args.pagato_da === "operaio" ? "pagato_da_me" : "conto_azienda",
      tipo: "scontrino",
      fornitore: esercente || null,
      data: dataIso,
      totale: importo,
      righe: [],
      note: args.categoria ? `Categoria: ${categoria}` : null,
    });
    if (!esito.ok) return esito;
    const cantiere = await nomeDelCantiere(ctx, args.order_id);
    const poi = args.pagato_da === "operaio" ? "Dopo la verifica dell'ufficio ti viene rimborsato." : "L'ufficio lo verifica e va sul conto dell'azienda.";
    return okResult({ campo_acquisto_id: esito.data.id, importo, order_id: args.order_id },
      `💶 Scontrino di € ${importo.toLocaleString("it-IT", { minimumFractionDigits: 2 })}${esercente ? ` da ${esercente}` : ""} messo su ${cantiere}. ${poi}`);
  }

  // Aggancio commessa: prova per codice, poi per nome cliente. Se non è chiaro,
  // si registra lo stesso e si scrive il cantiere nella descrizione.
  let orderId: string | null = null;
  const cantiere = String(args.cantiere ?? "").trim();
  if (args.order_id) {
    const { data: order, error: orderError } = await ctx.supabase.from("orders").select("id")
      .eq("company_id", ctx.company_id).eq("id", args.order_id).maybeSingle();
    if (orderError || !order) return errResult("invalid_order", "La commessa confermata non è disponibile. Nessuna spesa registrata.");
    orderId = order.id;
  } else if (cantiere) {
    const { data: byCode } = await ctx.supabase
      .from("orders").select("id").eq("company_id", ctx.company_id).ilike("order_code", `%${cantiere.slice(0, 40)}%`).limit(2);
    orderId = Array.isArray(byCode) && byCode.length === 1 ? byCode[0].id : null;
    if (!orderId) {
      const { data: byName } = await ctx.supabase
        .from("orders").select("id").eq("company_id", ctx.company_id).ilike("client_name", `%${cantiere.slice(0, 40)}%`).limit(2);
      if (Array.isArray(byName) && byName.length === 1) orderId = byName[0].id;
    }
    if (!orderId) return errResult("ambiguous_order", "Quale commessa? Indica il codice esatto prima di registrare la spesa.");
  }

  const descrizione = [esercente ? `Scontrino ${esercente}` : "Scontrino",
    cantiere && !orderId ? `(cantiere: ${cantiere})` : ""].filter(Boolean).join(" ").slice(0, 300);

  const { error } = await ctx.supabase.from("prima_nota_entries").insert({
    company_id: ctx.company_id,
    direction: "uscita",
    amount: importo,
    description: descrizione,
    category: categoria,
    entry_date: dataIso,
    order_id: orderId,
    created_by: ctx.user_id,
    is_auto: false,
    auto_source: "whatsapp_scontrino",
    notes: "Registrato da WhatsApp (foto scontrino)",
  });
  if (error) return errResult("insert", "Non sono riuscito a registrare la spesa. Riprova, oppure inseriscila dall'app in Prima Nota.");

  const dove = orderId ? " sul cantiere" : cantiere ? ` (cantiere «${cantiere}» da abbinare nell'app)` : "";
  return okResult({ importo, order_id: orderId }, `💶 Spesa di € ${importo.toLocaleString("it-IT", { minimumFractionDigits: 2 })}${esercente ? ` da ${esercente}` : ""} registrata${dove}.`);
}
