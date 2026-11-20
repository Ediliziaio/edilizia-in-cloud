import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { giornoCassa } from "../../../shared/cassaInCloud.ts";
import { dataDocumentoCassa } from "./client.ts";

export const ENTITA_CASSA = ["RECEIPT", "RECONCILIATION", "INVOICE"] as const;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 512 * 1024;

export async function firmaValidaCassa(segreto: string, firma: string, corpo: ArrayBuffer) {
  if (!/^[0-9a-f]{40}$/.test(firma)) return false;
  // L'algoritmo e il formato sono quelli del protocollo Cassa in Cloud.
  const chiave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segreto), { name: "HMAC", hash: "SHA-1" }, false, ["verify"]);
  const firmaBytes = Uint8Array.from(firma.match(/../g)!, (hex) => Number.parseInt(hex, 16));
  return crypto.subtle.verify("HMAC", chiave, firmaBytes, corpo);
}

export async function riceviWebhookCassa(admin: SupabaseClient, req: Request, url: URL) {
  const id = url.searchParams.get("webhook") ?? "";
  const operazione = req.headers.get("x-cn-operation") ?? "";
  const firma = req.headers.get("x-cn-signature") ?? "";
  const [entita, evento] = operazione.split("/");
  if (!UUID.test(id) || !ENTITA_CASSA.some((e) => e === entita) ||
      !["CREATE", "UPDATE", "DELETE"].includes(evento) || operazione !== `${entita}/${evento}` ||
      !/^[0-9a-f]{40}$/.test(firma)) return new Response(null, { status: 401 });
  if (Number(req.headers.get("content-length")) > MAX_BYTES) return new Response(null, { status: 413 });
  const { data, error } = await admin.rpc("cassa_in_cloud_leggi_webhook", { p_webhook_id: id, p_entita: entita }).maybeSingle();
  if (error) throw error;
  const webhook = data as { company_id: string; punto_vendita_id: string; sync_attivo: boolean; segreto: string } | null;
  if (!webhook) return new Response(null, { status: 401 });
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  if (!await firmaValidaCassa(webhook.segreto, firma, raw)) return new Response(null, { status: 401 });
  if (!webhook.sync_attivo) return new Response(null, { status: 202 });

  let documento;
  try { documento = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return new Response(null, { status: 400 }); }
  if (!documento || typeof documento !== "object" || typeof documento.id !== "string" || documento.id.length > 128) {
    return new Response(null, { status: 400 });
  }
  const punto = entita === "RECONCILIATION" ? documento.idSalesPoint : documento.document?.idSalesPoint;
  // La firma identifica il webhook, il punto vendita conserva l'isolamento dei dati.
  if (punto != null && String(punto) !== webhook.punto_vendita_id) return new Response(null, { status: 202 });
  const accoda = async (giorni: string[]) => {
    const oggi = giornoCassa();
    const richiesti = [...new Set(giorni.filter((g) => g <= oggi))].slice(0, 62);
    if (!richiesti.length) return new Response(null, { status: 202 });
    const { error } = await admin.rpc("cassa_in_cloud_accoda_giorni", {
      p_company_id: webhook.company_id, p_punto_vendita_id: webhook.punto_vendita_id, p_giorni: richiesti,
    });
    if (error) throw error;
    return new Response(null, { status: 202 });
  };

  if (entita === "INVOICE") {
    const r = await admin.from("cassa_in_cloud_scontrini").select("data")
      .eq("company_id", webhook.company_id).eq("punto_vendita_id", webhook.punto_vendita_id)
      .contains("fatture", [{ id: documento.id }]).limit(1000);
    if (r.error) throw r.error;
    const date = (r.data ?? []).map((s) => s.data as string);
    const linked: unknown[] = [documento.document?.documentConnectionSources, documento.document?.documentConnectionDestinations]
      .flatMap((d) => Array.isArray(d?.receipts) ? d.receipts : []);
    if (punto != null) {
      for (const valore of linked) {
        const s = valore as { date?: string; datetime?: string; document?: { idSalesPoint?: number } } | null;
        if (s?.document?.idSalesPoint != null && String(s.document.idSalesPoint) !== webhook.punto_vendita_id) continue;
        const data = dataDocumentoCassa(s?.date ?? s?.datetime);
        if (data) date.push(data);
      }
    }
    return await accoda(date);
  }

  let giorno = dataDocumentoCassa(documento.date ?? documento.datetime);
  if (!giorno || evento === "DELETE" || punto == null) {
    const chiusura = entita === "RECONCILIATION";
    const { data: trovato, error: cercaErrore } = await admin.from(chiusura ? "cassa_in_cloud_chiusure" : "cassa_in_cloud_scontrini")
      .select(chiusura ? "data_chiusura" : "data").eq("company_id", webhook.company_id)
      .eq("punto_vendita_id", webhook.punto_vendita_id).eq("esterno_id", documento.id).maybeSingle();
    if (cercaErrore) throw cercaErrore;
    if (punto == null && !trovato) return new Response(null, { status: 202 });
    const riga = trovato as { data_chiusura?: string; data?: string } | null;
    giorno = riga?.data_chiusura ?? riga?.data ?? giorno;
  }
  return await accoda([giorno ?? giornoCassa()]);
}
