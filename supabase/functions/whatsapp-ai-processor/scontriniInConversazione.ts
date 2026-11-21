import type { DdtLetto } from "../_shared/ddtLetto.ts";
import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";
import type { ToolCtx } from "./tools/shared/types.ts";

type Pagante = "operaio" | "azienda";
export interface ScontrinoLetto {
  importo: number | null;
  esercente?: string;
  data?: string;
  pagato_da?: Pagante;
}

export function paganteScontrino(testo: string): Pagante | undefined {
  const t = testo.toLowerCase().replace(/\s+/g, " ");
  if (/\bnon\b.{0,34}\b(?:pagato|pagata|ha pagato|carta|conto|anticipato)\b/.test(t)) return;
  if (/\b(?:carta|conto)\s+(?:dell['’]azienda|aziendale)|\bha pagato l['’]azienda\b/.test(t)) return "azienda";
  if (/\b(?:pagat[oa] io|pagat[oa] da me|ho anticipato|soldi miei|carta personale|pagato con la mia carta)\b/.test(t)) return "operaio";
}

export function importoScontrinoDetto(testo: string): number | undefined {
  const valore = testo.match(/\b(?:totale|importo)\s*(?:e|è|di|:)?\s*(?:€\s*)?(\d+(?:\.\d{3})*(?:,\d{1,2})?|\d+\.\d{1,2})(?![\d.,])/i)?.[1];
  if (!valore) return;
  const numero = Number(valore.includes(",") ? valore.replace(/\./g, "").replace(",", ".") : valore);
  if (Number.isFinite(numero) && numero > 0) return numero;
}

export function datiScontrino(lettura: DdtLetto | undefined, testo: string): ScontrinoLetto {
  const importo = lettura?.totale && lettura.totale > 0 ? lettura.totale : importoScontrinoDetto(testo) ?? null;
  return {
    importo,
    ...(lettura?.fornitore ? { esercente: lettura.fornitore.slice(0, 120) } : {}),
    ...(lettura?.data ? { data: lettura.data.slice(0, 16) } : {}),
    pagato_da: paganteScontrino(testo),
  };
}

export function domandaScontrino(dati: ScontrinoLetto): string {
  const totale = dati.importo != null ? " di " + dati.importo.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "";
  const richieste = [
    ...(dati.importo == null ? ["Mi scrivi o mi dici il totale?"] : []),
    ...(!dati.pagato_da ? ["L’hai pagato tu o con la carta dell’azienda?"] : []),
  ];
  return ["Scontrino" + totale + " salvato in WhatsApp del gestionale.", ...richieste].join(" ");
}

/** Recupera solo gli originali ancora in attesa della stessa persona e linea. */
export async function cercaScontriniInAttesa(ctx: ToolCtx, riferimento: string | null) {
  const query = ctx.supabase.from("whatsapp_messages")
    .select("id,message_type,media_storage_path,media_url,ai_extracted_data,content_text")
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
    .eq("direction", "inbound").in("message_type", ["image", "document"])
    .is("linked_record_id", null).not("ai_extracted_data->>scontrino_wa", "is", null);
  const { data, error } = await (riferimento
    ? query.eq("wa_message_id", riferimento)
    : query.gte("created_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString()))
    .order("created_at", { ascending: false }).limit(3);
  if (error) throw new Error("scontrini_in_attesa_non_disponibili");
  return (data ?? []).flatMap(r => {
    const path = r.media_storage_path;
    const scontrino = r.ai_extracted_data?.scontrino_wa as ScontrinoLetto | undefined;
    if (!scontrino || !path?.startsWith(ctx.company_id + "/") || !percorsoStorageSicuro(path)) return [];
    return [{ id: r.id as string, dati: scontrino, didascalia: String(r.content_text ?? ""), estrazione: r.ai_extracted_data,
      media: { storagePath: path as string, url: r.media_url ?? "", tipo: r.message_type as string } }];
  });
}
