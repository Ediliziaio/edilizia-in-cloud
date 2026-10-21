// Bolla o scontrino dell'operaio su WhatsApp → «Merce presa» (18/10/2026).
//
// Stessa strada dell'app Campo: il documento va in campo_acquisti sul
// cantiere confermato, l'ufficio lo verifica in Magazzino e diventa costo della
// commessa, rimborso all'operaio o carico dell'ordine d'acquisto. La foto si
// copia nel deposito dei documenti di cantiere (campo-rapportini), dove la apre
// l'ufficio; il file di WhatsApp resta dov'è.

import type { ToolCtx, ToolResult } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export type ModalitaMerce = "pagato_da_me" | "conto_azienda" | "ritiro_ordine";

export interface MerceDaRegistrare {
  orderId: string;
  modalita: ModalitaMerce;
  tipo: "bolla" | "scontrino" | "fattura" | "altro";
  fornitore?: string | null;
  numero?: string | null;
  data?: string | null;
  totale?: number | null;
  righe?: Array<{ descrizione: string; codice?: string | null; quantita?: number | null; unita?: string | null }>;
  lettura?: Record<string, unknown>;
  note?: string | null;
}

const ESTENSIONI: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Copia la foto arrivata su WhatsApp nel deposito dei documenti di cantiere. Null se non riesce. */
export async function copiaFotoDocumento(ctx: ToolCtx, orderId: string): Promise<string | null> {
  const media = ctx.mediaCorrente;
  if (!media?.storagePath || !["image", "document"].includes(media.tipo)) return null;
  try {
    const { data: file, error } = await ctx.supabase.storage.from("whatsapp-media").download(media.storagePath);
    if (error || !file) return null;
    const tipo = file.type || "image/jpeg";
    const estensione = ESTENSIONI[tipo] ?? "jpg";
    const percorso = `${ctx.company_id}/${orderId}/acquisti/${crypto.randomUUID()}.${estensione}`;
    const { data, error: upError } = await ctx.supabase.storage.from("campo-rapportini")
      .upload(percorso, file, { contentType: tipo, upsert: false });
    return upError || !data?.path ? null : data.path;
  } catch {
    return null;
  }
}

function dataIso(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anno}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Registra il documento in «Merce presa». Il messaggio d'errore della funzione è già scritto per l'operaio. */
export async function registraMerceDaWhatsApp(ctx: ToolCtx, merce: MerceDaRegistrare): Promise<ToolResult<{ id: string; foto: boolean }>> {
  if (!ctx.user_id && !ctx.employee_id) return errResult("no_identity", "Non riesco a identificarti: chiedi all'ufficio di controllare il tuo numero in anagrafica.");
  const foto = await copiaFotoDocumento(ctx, merce.orderId);
  const { data, error } = await ctx.supabase.rpc("campo_acquisto_registra_whatsapp", {
    p_company_id: ctx.company_id,
    p_user_id: ctx.user_id,
    p_employee_id: ctx.employee_id,
    p_order_id: merce.orderId,
    p_modalita: merce.modalita,
    p_tipo_documento: merce.tipo,
    p_fornitore: merce.fornitore ?? null,
    p_numero: merce.numero ?? null,
    p_data: dataIso(merce.data),
    p_totale: typeof merce.totale === "number" && Number.isFinite(merce.totale) ? Math.round(merce.totale * 100) / 100 : null,
    p_righe: (merce.righe ?? []).map((r) => ({
      descrizione: r.descrizione,
      ...(r.codice ? { codice: r.codice } : {}),
      ...(typeof r.quantita === "number" ? { quantita: r.quantita } : {}),
      ...(r.unita ? { unita: r.unita } : {}),
    })),
    p_foto_path: foto,
    p_lettura: { fonte: "whatsapp", messaggio: ctx.requestId ?? null, ...(merce.lettura ?? {}) },
    p_note: merce.note ?? null,
  });
  if (error || typeof data !== "string") {
    // P0001: messaggio pensato per l'operaio («già caricato da…», «non ti è assegnato»).
    const scritto = (error as { code?: string } | null)?.code === "P0001" ? error!.message : null;
    return errResult("merce_non_registrata", scritto ?? "Non sono riuscito a registrare il documento. Riprova tra poco oppure caricalo dall'app in «Merce presa».");
  }
  return okResult({ id: data, foto: !!foto });
}

/** Il nome breve del cantiere, per la risposta all'operaio. */
export async function nomeDelCantiere(ctx: ToolCtx, orderId: string): Promise<string> {
  const { data } = await ctx.supabase.from("orders").select("order_code, description, client_name").eq("company_id", ctx.company_id).eq("id", orderId).maybeSingle();
  return [data?.client_name || data?.description, data?.order_code].filter(Boolean).join(" · ") || "il cantiere";
}
