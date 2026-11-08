/**
 * Il controllo del documento del fornitore (fase 6 del piano articoli su misura).
 *
 * Il documento è un'offerta o una conferma d'ordine. L'AI riceve soltanto il documento e
 * trascrive: non vede cosa abbiamo chiesto, così non può adeguare la lettura. Il confronto
 * lo fa `_shared/confrontoDocumentoFornitore.ts`. Lo stesso file due volte non si rilegge.
 */
import { errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";
import { chargeAndLogDirect, estimateTokenCostUsd } from "../_shared/ai-provider/directApi.ts";
import { precallCheck } from "../_shared/ai-provider/billing.ts";
import type { TaskKind } from "../_shared/ai-provider/types.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { claudeMessages, hasClaudeProvider, type ClaudeMessagesBody } from "../_shared/claudeProxy.ts";
import {
  confrontaDocumento, ereditaDaOfferta, esitoConsegna, peggiore,
  type EsitoCampo, type RigaChiesta, type RigaConfronto, type RigaLetta,
} from "../_shared/confrontoDocumentoFornitore.ts";

const AI_MODEL = "claude-sonnet-4-20250514";
const MAX_BYTES = 10 * 1024 * 1024;
const LIMITE_GIORNALIERO = 40;
const TASK = "vision_po" as TaskKind;
const LETTURA_FERMA_MS = 5 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RichiestaControllo {
  purchase_order_id?: string;
  rfq_supplier_id?: string;
  tipo?: "offerta" | "conferma";
  document_base64?: string;
  file_nome?: string;
  email_attachment_id?: string;
}

interface Lettura {
  righe?: RigaLetta[];
  data_consegna?: string | null;
  giorni_consegna?: number | null;
  numero_documento?: string | null;
  totale_documento?: number | null;
  altri_costi?: Array<{ descrizione?: string; importo?: number | null }> | null;
}

const PROMPT = `Sei un impiegato dell'ufficio acquisti di un'impresa edile italiana. Hai davanti un documento di un fornitore: un'offerta o una conferma d'ordine, in PDF o in foto.
Il tuo compito è solo TRASCRIVERE quello che c'è scritto, una riga per ogni posizione. Non confrontare, non giudicare, non correggere, non completare.
Regole:
- Le misure sempre in millimetri: se il documento scrive cm o m, converti. Larghezza e altezza del serramento come le scrive il fornitore.
- "riferimento" è il nome della posizione se c'è (Cucina, P3, Pos. 1, Rif. 2); altrimenti null.
- Trasporto, imballo, sconti generali e spese vanno in "altri_costi", non in "righe".
- Un dato che non c'è è null: non inventare mai.
- "confidenza" (0-100) è quanto sei sicuro di aver letto bene QUELLA riga. Sotto 60 se la foto è sfocata o hai dovuto interpretare.
- "incerti" elenca i campi letti con dubbio (per esempio ["larghezza_mm","colore"]).
- Date YYYY-MM-DD. Numeri col punto decimale. Prezzi unitari senza IVA, al netto dello sconto di riga.
Rispondi SOLO con questo JSON:
{"numero_documento":null,"data_consegna":null,"giorni_consegna":null,"totale_documento":null,"altri_costi":[{"descrizione":"","importo":null}],"righe":[{"riferimento":null,"descrizione":"","codice_articolo":null,"quantita":null,"unita":null,"larghezza_mm":null,"altezza_mm":null,"profondita_mm":null,"mq":null,"colore":null,"apertura":null,"materiale":null,"formato":null,"lotto":null,"prezzo_unitario":null,"confidenza":0,"incerti":[]}]}`;

function byteDaBase64(testo: string): Uint8Array {
  const bin = atob(testo.replace(/^data:[^;]+;base64,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64DaByte(buf: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(bin);
}

async function impronta(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const eSpesa = (t?: string | null) => /^\s*(trasporto|imballo|spese|sconto)/i.test(t ?? "");

async function righeChieste(db: Db, poId?: string, rfqId?: string): Promise<Array<RigaChiesta & { rfq_item_id?: string | null }>> {
  if (poId) {
    const { data, error } = await db.from("purchase_order_items")
      .select("id, description, sku, quantity, unit_of_measure, unit_price, discount_percent, price_pending, riferimento, misure, colore, apertura, misure_testo, rfq_item_id, sort_order")
      .eq("purchase_order_id", poId).order("sort_order");
    if (error) throw error;
    return (data ?? []).filter((r: { description: string }) => !eSpesa(r.description)).map((r: Record<string, unknown>) => ({
      chiave: r.id as string, riferimento: r.riferimento as string | null, descrizione: r.description as string, sku: r.sku as string | null,
      quantita: Number(r.quantity), unita: r.unit_of_measure as string | null,
      prezzo: r.price_pending ? null : Number(r.unit_price) * (1 - Number(r.discount_percent ?? 0) / 100),
      misure: r.misure as RigaChiesta["misure"], colore: r.colore as string | null, apertura: r.apertura as string | null,
      dettagli: r.misure_testo as string | null, rfq_item_id: r.rfq_item_id as string | null,
    }));
  }
  const { data, error } = await db.from("supplier_rfq_items")
    .select("id, descrizione, sku, quantita, unita_misura, riferimento, misure, colore, apertura, misure_testo, note, posizione")
    .eq("rfq_id", rfqId).order("posizione");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    chiave: r.id as string, riferimento: r.riferimento as string | null, descrizione: r.descrizione as string, sku: r.sku as string | null,
    quantita: Number(r.quantita), unita: r.unita_misura as string | null, prezzo: null,
    misure: r.misure as RigaChiesta["misure"], colore: r.colore as string | null, apertura: r.apertura as string | null,
    dettagli: (r.misure_testo ?? r.note) as string | null,
  }));
}

/** L'offerta già controllata dello stesso fornitore da cui viene questo ordine, se c'è. */
async function offertaControllata(db: Db, po: { id: string; supplier_id: string }, chieste: Array<{ rfq_item_id?: string | null; chiave: string }>) {
  const ids = chieste.flatMap((r) => (r.rfq_item_id ? [r.rfq_item_id] : []));
  if (!ids.length) return null;
  const { data: voci } = await db.from("supplier_rfq_items").select("id, rfq_id").in("id", ids);
  const rfq = voci?.[0]?.rfq_id;
  if (!rfq) return null;
  const { data: rs } = await db.from("supplier_rfq_suppliers").select("id").eq("rfq_id", rfq).eq("supplier_id", po.supplier_id).maybeSingle();
  if (!rs) return null;
  const { data: c } = await db.from("controlli_documento_fornitore").select("righe, esito, accettato_il, file_hash, lettura")
    .eq("rfq_supplier_id", rs.id).eq("tipo", "offerta").eq("stato", "letto").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!c || (c.esito !== "verde" && c.esito !== "giallo" && !c.accettato_il)) return null;
  const versoRiga = new Map(chieste.flatMap((r) => (r.rfq_item_id ? [[r.rfq_item_id, r.chiave] as const] : [])));
  const righe = ((c.righe ?? []) as RigaConfronto[]).flatMap((o) => {
    const chiave = versoRiga.get(o.chiave);
    return chiave ? [{ ...o, chiave, deciso_da_persona: o.deciso_da_persona || !!c.accettato_il }] : [];
  });
  return { righe, file_hash: c.file_hash as string, lettura: c.lettura as Lettura };
}

export async function controllaDocumento(
  body: RichiestaControllo, userId: string, db: Db, corsH: Record<string, string>,
): Promise<Response> {
  const tipo = body.tipo;
  if (tipo !== "offerta" && tipo !== "conferma") return errorResponse("tipo deve essere offerta o conferma", 400, corsH);
  if (!!body.purchase_order_id === !!body.rfq_supplier_id) return errorResponse("Indica l'ordine o il fornitore dell'offerta", 400, corsH);

  // ── Di chi è il documento ───────────────────────────────────────────
  let po: { id: string; company_id: string; supplier_id: string; expected_delivery_date: string | null } | null = null;
  let rs: { id: string; company_id: string; rfq_id: string; email_inbox_id: string | null } | null = null;
  if (body.purchase_order_id) {
    const { data } = await db.from("purchase_orders").select("id, company_id, supplier_id, expected_delivery_date").eq("id", body.purchase_order_id).maybeSingle();
    po = data;
    if (!po) return errorResponse("Ordine non trovato", 404, corsH);
  } else {
    const { data } = await db.from("supplier_rfq_suppliers").select("id, company_id, rfq_id, email_inbox_id").eq("id", body.rfq_supplier_id).maybeSingle();
    rs = data;
    if (!rs) return errorResponse("Fornitore della richiesta non trovato", 404, corsH);
  }
  const companyId = (po?.company_id ?? rs?.company_id) as string;
  await requireCompanyAccess(db, userId, companyId, corsH);
  const [{ data: acquisti }, { data: commesse }] = await Promise.all([
    db.rpc("has_permission_for_company", { _user_id: userId, _permission: "can_manage_purchasing", _company_id: companyId }),
    db.rpc("has_permission_for_company", { _user_id: userId, _permission: "can_edit_orders", _company_id: companyId }),
  ]);
  if (!acquisti && !commesse) return errorResponse("Gli acquisti li fa l'ufficio acquisti (o chi modifica le commesse)", 403, corsH);

  // ── Il file: caricato ora o allegato dell'email agganciata ──────────
  let bytes: Uint8Array;
  let nome = body.file_nome ?? "documento";
  let mime = "application/pdf";
  let emailInbox: string | null = null;
  if (body.email_attachment_id) {
    const { data: a } = await db.from("email_attachments").select("id, inbox_id, filename, mime_type, storage_path, size_bytes").eq("id", body.email_attachment_id).maybeSingle();
    if (!a?.inbox_id) return errorResponse("Allegato non trovato", 404, corsH);
    const { data: mail } = await db.from("email_inbox").select("id, company_id, purchase_order_id").eq("id", a.inbox_id).maybeSingle();
    const agganciata = mail?.company_id === companyId && (po ? mail.purchase_order_id === po.id : rs?.email_inbox_id === mail.id);
    if (!agganciata) return errorResponse("Questo allegato non è agganciato a questo documento", 403, corsH);
    if (Number(a.size_bytes ?? 0) > MAX_BYTES) return errorResponse("Allegato troppo grande (max 10MB)", 400, corsH);
    const { data: blob, error } = await db.storage.from("email-attachments").download(a.storage_path);
    if (error || !blob) return errorResponse("Allegato non scaricabile", 502, corsH);
    bytes = new Uint8Array(await blob.arrayBuffer());
    nome = a.filename ?? nome;
    mime = a.mime_type ?? mime;
    emailInbox = a.inbox_id;
  } else if (body.document_base64) {
    if (body.document_base64.length > MAX_BYTES * 1.34) return errorResponse("Documento troppo grande (max 10MB)", 400, corsH);
    mime = /^data:([^;]+);/.exec(body.document_base64)?.[1] ?? (body.document_base64.startsWith("/9j/") ? "image/jpeg" : "application/pdf");
    try { bytes = byteDaBase64(body.document_base64); } catch { return errorResponse("File non leggibile", 400, corsH); }
  } else {
    return errorResponse("Nessun documento: carica un file o scegli l'allegato", 400, corsH);
  }
  const hash = await impronta(bytes);
  const obiettivo = { company_id: companyId, purchase_order_id: po?.id ?? null, rfq_supplier_id: rs?.id ?? null, tipo };

  // ── Lo stesso documento due volte, o due schede insieme ─────────────
  const riserva = await db.from("controlli_documento_fornitore")
    .insert({ ...obiettivo, stato: "in_lettura", file_hash: hash, file_nome: nome, email_inbox_id: emailInbox, created_by: userId })
    .select("id").single();
  if (riserva.error) {
    if (riserva.error.code !== "23505") throw riserva.error;
    let q = db.from("controlli_documento_fornitore").select("id, stato, esito, created_at").eq("company_id", companyId).eq("tipo", tipo).eq("file_hash", hash);
    q = po ? q.eq("purchase_order_id", po.id) : q.eq("rfq_supplier_id", rs!.id);
    const { data: gia } = await q.maybeSingle();
    if (gia?.stato === "letto") return jsonResponse({ ok: true, id: gia.id, esito: gia.esito, gia_caricato: true }, 200, corsH);
    if (gia && Date.now() - new Date(gia.created_at).getTime() < LETTURA_FERMA_MS) {
      return errorResponse("Questo documento lo sta già leggendo qualcuno: aspetta qualche secondo", 409, corsH);
    }
    if (gia) await db.from("controlli_documento_fornitore").delete().eq("id", gia.id).eq("stato", "in_lettura");
    return errorResponse("La lettura precedente non era finita: riprova adesso", 409, corsH);
  }
  const id = riserva.data.id as string;

  try {
    const chieste = await righeChieste(db, po?.id, rs?.rfq_id);
    if (!chieste.length) throw new Response(JSON.stringify({ error: "Non ci sono righe da confrontare" }), { status: 400, headers: { ...corsH, "Content-Type": "application/json" } });
    const offerta = po && tipo === "conferma" ? await offertaControllata(db, po, chieste) : null;

    // ── Il file in archivio, per riaprirlo dalla pagina ─────────────
    const estensione = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
    const percorso = `${companyId}/controlli-fornitore/${hash}.${estensione}`;
    const up = await db.storage.from("order-attachments").upload(percorso, bytes, { contentType: mime, upsert: false });
    if (up.error && !/already exists|duplicate/i.test(up.error.message ?? "")) console.error("[controllaDocumento] archivio:", up.error.message);

    // ── La lettura: se è lo stesso file dell'offerta, non si rilegge ─
    let lettura: Lettura;
    if (offerta && offerta.file_hash === hash && offerta.lettura) {
      lettura = offerta.lettura;
    } else {
      lettura = await leggiConAi(db, { companyId, userId, id, bytes, mime, hash, corsH });
    }

    const lette = (lettura.righe ?? []).filter((r) => !eSpesa(r.descrizione));
    const { data: impostazioni } = await db.from("company_acquisti_impostazioni").select("conferma_tolleranza_mm").eq("company_id", companyId).maybeSingle();
    const tolleranzaMm = Number(impostazioni?.conferma_tolleranza_mm ?? 5);
    const { righe: confronto } = confrontaDocumento(chieste, lette, { tolleranzaMm });
    const righe = ereditaDaOfferta(confronto, offerta?.righe);

    const consegna: EsitoCampo | null = po ? esitoConsegna(po.expected_delivery_date, lettura.data_consegna) : null;
    if (consegna?.esito === "giallo") {
      righe.push({ chiave: "consegna", riferimento: null, descrizione: "Data di consegna", categoria: "generico", stato: "abbinata", esito: "giallo", chiesto: consegna.chiesto ?? "—", letto: consegna.letto ?? "—", campi: [consegna] });
    }
    const esito = righe.length ? peggiore(righe.map((r) => r.esito)) : "da_controllare";

    const { error } = await db.from("controlli_documento_fornitore").update({
      stato: "letto", esito, lettura, righe, file_path: `order-attachments/${percorso}`, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
    return jsonResponse({ ok: true, id, esito, righe: righe.length }, 200, corsH);
  } catch (err) {
    // Una lettura andata male non deve impedire di riprovare con lo stesso file.
    await db.from("controlli_documento_fornitore").delete().eq("id", id).eq("stato", "in_lettura");
    throw err;
  }
}

async function leggiConAi(db: Db, x: { companyId: string; userId: string; id: string; bytes: Uint8Array; mime: string; hash: string; corsH: Record<string, string> }): Promise<Lettura> {
  const risposta = (msg: string, status: number) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...x.corsH, "Content-Type": "application/json" } });
  const oggi = new Date().toISOString().slice(0, 10);
  const { count } = await db.from("ai_model_usage_log").select("id", { count: "exact", head: true })
    .eq("company_id", x.companyId).eq("task_kind", TASK).gte("ts", `${oggi}T00:00:00Z`);
  if ((count ?? 0) >= LIMITE_GIORNALIERO) throw risposta(`Limite giornaliero raggiunto (${LIMITE_GIORNALIERO} letture). Riprova domani.`, 429);
  const pre = await precallCheck(db, { company_id: x.companyId, task_kind: TASK, estimated_tokens_total: 6000 });
  if (!pre.allow) throw risposta(pre.user_message_it || "Crediti AI esauriti: ricarica il borsellino per leggere il documento.", 402);
  if (!hasClaudeProvider()) throw risposta("AI non configurata", 500);

  const dati = base64DaByte(x.bytes);
  const eImmagine = x.mime.startsWith("image/");
  const ai = await claudeMessages({
    model: AI_MODEL, max_tokens: 8000, system: PROMPT,
    messages: [{ role: "user", content: [
      eImmagine
        ? { type: "image", source: { type: "base64", media_type: x.mime, data: dati } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: dati } },
      { type: "text", text: "Trascrivi questo documento nel JSON richiesto." },
    ] }],
  } as ClaudeMessagesBody);
  if (!ai.ok) {
    console.error("[controllaDocumento] AI:", ai.status, (await ai.text()).slice(0, 300));
    throw risposta(`Lettura AI non riuscita (${ai.status})`, 502);
  }
  const corpo = await ai.json();
  const inToken = Number(corpo.usage?.input_tokens ?? 0);
  const outToken = Number(corpo.usage?.output_tokens ?? 0);
  await chargeAndLogDirect({
    supabase: db, company_id: x.companyId, task_kind: TASK, model_used: `anthropic/${AI_MODEL}`,
    cost_usd_real: estimateTokenCostUsd({ provider: "anthropic", model: AI_MODEL, inputTokens: inToken, outputTokens: outToken, fallbackCostUsd: 0.02 }),
    cost_is_estimated: true, tokens_prompt: inToken, tokens_completion: outToken,
    metadata: { user_id: x.userId, controllo_id: x.id, idempotency_key: await buildStableAiIdempotencyKey("controllo_documento", [{ company_id: x.companyId, hash: x.hash }]) },
  });
  const testo = corpo.content?.find((c: { type?: string }) => c.type === "text")?.text ?? "";
  const trovato = testo.match(/\{[\s\S]*\}/);
  if (!trovato) throw risposta("Il documento non si è potuto leggere: riprova o controlla il file", 502);
  try {
    return JSON.parse(trovato[0]) as Lettura;
  } catch {
    throw risposta("Il documento non si è potuto leggere: riprova o controlla il file", 502);
  }
}
