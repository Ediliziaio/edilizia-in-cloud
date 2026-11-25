// Strumenti dell'assistente per il lavoro vero di un'azienda (25/11/2026).
//
// «Un'azienda potrebbe caricare una planimetria su Claude che finisce in
// Edilizia in Cloud e si sviluppa un preventivo.» Qui le strade che servono,
// sempre quelle che l'app usa già (mai una copia della logica):
// - voci dal listino: ai-genera-preventivo-v2 (chiamata interna, crediti AI dell'azienda);
// - preventivo: silvio_create_quote_draft (numero vero, totali e IVA dal database);
// - PDF: generate-quote-pdf (chiamata interna); firma: send-quote-signature col
//   token dell'utente (solo collegamenti OAuth: valgono le sue regole sulle righe);
// - appuntamenti e sopralluoghi: gli esecutori di Silvio;
// - file: un caricamento firmato verso Edilizia in Cloud (pagina /carica-file),
//   poi silvio-extract-pdf per leggerlo o computo-ai-extract per il computo.
//
// I permessi dell'app di chi ha collegato li controlla permessiStrumenti.ts,
// prima di arrivare qui.

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type KeyCtx, type ToolDef, ToolError, resolveCompany, UUID_RE, str, num, intLimit } from "./lib.ts";
import { SILVIO_TOOLS as STRUMENTI_SILVIO } from "../_shared/silvioTools.ts";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
// L'app sta sul sottodominio app.: il dominio del sito risponde 404 alle pagine interne.
const URL_APP = (Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com").replace(/\/$/, "");

/** Chiamata a un'altra nostra funzione come servizio, per conto dell'utente (per_utente). */
async function funzioneInterna(nome: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const risposta = await fetch(`${URL_BASE}/functions/v1/${nome}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify(corpo),
  });
  const dati = await risposta.json().catch(() => ({})) as Record<string, unknown>;
  if (!risposta.ok) throw new ToolError(String(dati.error ?? dati.message ?? dati.messaggio ?? `Errore ${risposta.status} da ${nome}`));
  return dati;
}

/** Chiamata col token dell'utente: la funzione applica le sue regole come se fosse nell'app. */
async function funzioneComeUtente(ctx: KeyCtx, nome: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!ctx.tokenUtente) {
    throw new ToolError("Disponibile solo collegando l'assistente con l'accesso (Claude.ai o ChatGPT), non con una chiave API.");
  }
  const risposta = await fetch(`${URL_BASE}/functions/v1/${nome}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.tokenUtente}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify(corpo),
  });
  const dati = await risposta.json().catch(() => ({})) as Record<string, unknown>;
  if (!risposta.ok) throw new ToolError(String(dati.error ?? dati.message ?? `Errore ${risposta.status} da ${nome}`));
  return dati;
}

async function preventivoDa(admin: SupabaseClient, companyId: string, raw: unknown) {
  const testo = str(raw);
  if (!testo) throw new ToolError('Parametro "preventivo" obbligatorio (UUID o numero, es. OFF-2026-012)');
  const q = admin.from("quotes").select("id, quote_number, client_name, client_email, status, total").eq("company_id", companyId);
  const { data } = UUID_RE.test(testo) ? await q.eq("id", testo).limit(1) : await q.ilike("quote_number", testo).limit(2);
  if (!data || data.length === 0) throw new ToolError(`Preventivo «${testo}» non trovato in questa azienda`);
  if (data.length > 1) throw new ToolError(`Più preventivi corrispondono a «${testo}»: usa l'UUID.`);
  return data[0] as { id: string; quote_number: string; client_name: string | null; client_email: string | null; status: string; total: number | null };
}

async function eseguiSilvio(admin: SupabaseClient, ctx: KeyCtx, companyId: string, nome: string, args: Record<string, unknown>) {
  const strumento = STRUMENTI_SILVIO[nome];
  if (!strumento) throw new ToolError(`Strumento ${nome} non disponibile`);
  const esito = await strumento.executor(args, {
    supabase: admin, companyId, userId: ctx.created_by, primaryRole: ctx.attore?.ruolo ?? "company_admin",
    staffPermissions: ctx.attore?.permessi ?? null,
  }) as Record<string, unknown>;
  if (esito && typeof esito === "object" && "error" in esito && esito.error) throw new ToolError(String(esito.error));
  return esito;
}

const VOCE = {
  type: "object",
  properties: {
    nome: { type: "string" },
    descrizione: { type: "string" },
    quantita: { type: "number" },
    unita: { type: "string", description: "mq, ml, pz, a corpo…" },
    prezzo_unitario: { type: "number", description: "Euro, IVA esclusa" },
    tipo: { type: "string", enum: ["material", "labor", "subcontract", "service", "other"] },
    iva: { type: "number" },
  },
  required: ["nome", "quantita", "prezzo_unitario"],
  additionalProperties: false,
};

export const AZIENDA_TOOLS: ToolDef[] = [
  {
    name: "proponi_voci_preventivo",
    description: "Propone le voci di un preventivo prendendo prezzi e articoli dal LISTINO dell'azienda, da una descrizione del lavoro e dalle misure (anche quelle che leggi tu da una planimetria o da una foto). Non salva niente: mostra le voci all'utente, poi usa crea_preventivo. Consuma crediti AI dell'azienda.",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        descrizione: { type: "string", description: "Il lavoro: es. «rifacimento bagno 6 mq, piatto doccia, sanitari sospesi»" },
        tipo_lavoro: { type: "string" },
        misure: {
          type: "array",
          items: { type: "object", properties: { label: { type: "string" }, valore: { type: "number" }, unita: { type: "string" } }, required: ["label", "valore", "unita"] },
        },
      },
      required: ["descrizione"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const esito = await funzioneInterna("ai-genera-preventivo-v2", {
        company_id: az.id, per_utente: ctx.created_by, descrizione: str(args.descrizione),
        tipo_lavoro: str(args.tipo_lavoro) ?? undefined, misure: Array.isArray(args.misure) ? args.misure : undefined,
        input_mode: "testo",
      });
      return { azienda: az.name, sezioni: esito.sezioni ?? [], note: esito.note ?? null, avvertenze: esito.avvertenze ?? [] };
    },
  },
  {
    name: "crea_preventivo",
    description: "Crea un preventivo in BOZZA dentro Edilizia in Cloud, con numero vero e totali calcolati. Mostra prima cliente e voci all'utente. Poi puoi usare pdf_preventivo.",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        cliente_nome: { type: "string" }, cliente_email: { type: "string" }, cliente_telefono: { type: "string" },
        cliente_indirizzo: { type: "string" }, titolo: { type: "string" }, descrizione: { type: "string" },
        tipo_lavoro: { type: "string" }, indirizzo_lavori: { type: "string" },
        validita_giorni: { type: "integer", minimum: 1, maximum: 365 },
        iva_predefinita: { type: "number" },
        note_interne: { type: "string" },
        voci: { type: "array", items: VOCE, minItems: 1, maxItems: 200 },
      },
      required: ["cliente_nome", "voci"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const voci = (Array.isArray(args.voci) ? args.voci : []) as Record<string, unknown>[];
      const { data, error } = await admin.rpc("silvio_create_quote_draft", {
        p_company_id: az.id, p_user_id: ctx.created_by,
        p_client_name: str(args.cliente_nome), p_client_email: str(args.cliente_email), p_client_phone: str(args.cliente_telefono),
        p_client_address: str(args.cliente_indirizzo), p_title: str(args.titolo), p_description: str(args.descrizione),
        p_tipo_lavoro: str(args.tipo_lavoro), p_indirizzo_lavori: str(args.indirizzo_lavori),
        p_items: voci.map((v) => ({
          item_type: str(v.tipo) ?? "other", name: str(v.nome), description: str(v.descrizione),
          quantity: num(v.quantita), unit_price: num(v.prezzo_unitario), unit_of_measure: str(v.unita) ?? "pz",
          vat_rate: num(v.iva),
        })),
        p_validity_days: intLimit(args.validita_giorni, 30, 365),
        p_default_vat_rate: num(args.iva_predefinita) ?? 22,
        p_internal_notes: str(args.note_interne) ?? "Creato dall'assistente AI",
      });
      if (error) throw new ToolError(error.message === "Quote permission denied" ? "Non hai il permesso di creare preventivi." : error.message);
      const esito = (data ?? {}) as Record<string, unknown>;
      return { azienda: az.name, ...esito, apri: esito.quote_id ? `${URL_APP}/azienda/marketing/preventivi/${esito.quote_id}` : null };
    },
  },
  {
    name: "pdf_preventivo",
    description: "Genera il PDF di un preventivo e restituisce un link per scaricarlo (valido 1 ora).",
    scope: "quotes:read",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, preventivo: { type: "string", description: "UUID o numero" } },
      required: ["preventivo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const p = await preventivoDa(admin, az.id, args.preventivo);
      const esito = await funzioneInterna("generate-quote-pdf", { quote_id: p.id, per_utente: ctx.created_by });
      return { preventivo: p.quote_number, cliente: p.client_name, link_pdf: esito.signed_url ?? null, valido_per: "1 ora" };
    },
  },
  {
    name: "invia_preventivo_in_firma",
    description: "Manda al cliente il preventivo da firmare (email con link di firma elettronica). Invio REALE: mostra destinatario e messaggio e chiedi conferma.",
    scope: "email:send",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, preventivo: { type: "string" },
        email: { type: "string", description: "Se vuota, quella del cliente nel preventivo" },
        nome: { type: "string" }, messaggio: { type: "string" },
        scadenza_giorni: { type: "integer", minimum: 1, maximum: 90 },
        solo_pdf: { type: "boolean", description: "true = manda solo il PDF, senza firma" },
      },
      required: ["preventivo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const p = await preventivoDa(admin, az.id, args.preventivo);
      const esito = await funzioneComeUtente(ctx, "send-quote-signature", {
        quote_id: p.id, recipient_email: str(args.email) ?? p.client_email, recipient_name: str(args.nome) ?? p.client_name,
        custom_message: str(args.messaggio), expires_days: intLimit(args.scadenza_giorni, 30, 90),
        ...(args.solo_pdf === true ? { mode: "solo_pdf" } : {}),
      });
      return { preventivo: p.quote_number, inviato_a: str(args.email) ?? p.client_email, esito };
    },
  },
  {
    name: "fissa_appuntamento",
    description: "Fissa un appuntamento nel calendario aziendale (sopralluogo, riunione, consegna, visita cantiere). Date YYYY-MM-DD, ora HH:MM. Chiedi conferma prima.",
    scope: "appointments:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, titolo: { type: "string" }, data: { type: "string" }, ora: { type: "string" },
        durata_minuti: { type: "number" }, tipo: { type: "string" }, descrizione: { type: "string" },
        indirizzo: { type: "string" }, commessa_codice: { type: "string" }, assegna_a: { type: "string" },
      },
      required: ["titolo", "data"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const { company: _c, ...resto } = args;
      return { azienda: az.name, ...(await eseguiSilvio(admin, ctx, az.id, "fissa_appuntamento", resto)) };
    },
  },
  {
    name: "crea_sopralluogo",
    description: "Crea un sopralluogo (rilievo) da fare: modello (es. bagno, infissi, tetto, fotovoltaico), cliente, tecnico, data, indirizzo.",
    scope: "appointments:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, tipo_rilievo: { type: "string" }, cliente_nome: { type: "string" },
        tecnico: { type: "string" }, data_ora: { type: "string" }, indirizzo: { type: "string" }, citta: { type: "string" },
        cap: { type: "string" }, provincia: { type: "string" }, commessa_codice: { type: "string" }, note: { type: "string" },
      },
      required: ["tipo_rilievo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const { company: _c, ...resto } = args;
      return { azienda: az.name, ...(await eseguiSilvio(admin, ctx, az.id, "crea_sopralluogo", resto)) };
    },
  },
  {
    name: "link_caricamento",
    description: "Porta in Edilizia in Cloud un file della chat (planimetria PDF/immagine/DWG/DXF, oppure computo PDF/Excel/XPWE). Restituisce: «caricamento_diretto», un indirizzo dove caricare il file con PUT — se hai l'esecuzione del codice e il file è nella tua cartella, caricalo tu con il comando curl indicato, senza chiedere niente all'utente; e «link», una pagina dove l'utente trascina il file se tu non puoi. Valgono 2 ore. Su ChatGPT usa invece carica_file_dalla_chat. Poi leggi_file_caricato o importa_computo con il percorso restituito.",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        tipo: { type: "string", enum: ["planimetria", "computo"] },
        nome_file: { type: "string", description: "Nome del file con estensione, es. pianta.pdf" },
      },
      required: ["tipo", "nome_file"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const tipo = str(args.tipo) === "computo" ? "computo" : "planimetria";
      const nome = (str(args.nome_file) ?? "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
      const estensione = nome.split(".").pop()?.toLowerCase() ?? "";
      const ammesse = tipo === "computo" ? ["pdf", "xlsx", "xls", "xpwe", "dcf", "xml", "jpg", "jpeg", "png", "webp"]
        : ["pdf", "jpg", "jpeg", "png", "webp", "dwg", "dxf"];
      if (!ammesse.includes(estensione)) throw new ToolError(`Formato non ammesso per ${tipo}: ${ammesse.join(", ")}`);
      const bucket = tipo === "computo" ? "computi" : "planimetrie";
      const percorso = tipo === "computo" ? `${az.id}/${Date.now()}-${nome}` : `${az.id}/assistente/${crypto.randomUUID()}-${nome}`;
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(percorso);
      if (error || !data?.token) throw new ToolError(`Link di caricamento non creato: ${error?.message ?? "nessun token"}`);
      const link = `${URL_APP}/carica-file?b=${bucket}&p=${encodeURIComponent(percorso)}&t=${encodeURIComponent(data.token)}&n=${encodeURIComponent(nome)}`;
      return {
        percorso, bucket, valido_per: "2 ore",
        // Claude.ai: il file allegato sta nella sandbox dell'esecuzione del codice; da lì si carica con curl
        // (il dominio di Supabase va tra i domini consentiti dell'esecuzione del codice).
        caricamento_diretto: {
          metodo: "PUT",
          url: data.signedUrl,
          esempio_curl: `curl -sS -X PUT -H "Content-Type: <tipo del file>" --data-binary @"<percorso locale del file>" "${data.signedUrl}"`,
        },
        link,
        istruzioni_utente: "Se l'assistente non può caricarlo da sé: apri il link, trascina il file e torna qui quando vedi «Caricato».",
      };
    },
  },
  {
    // ChatGPT: con «openai/fileParams» il file allegato in chat arriva come link temporaneo da scaricare.
    name: "carica_file_dalla_chat",
    description: "Porta in Edilizia in Cloud un file che l'utente ha allegato in questa chat (planimetria o computo). Passa il file nel parametro «file». Poi leggi_file_caricato o importa_computo con il percorso restituito.",
    scope: "quotes:write",
    meta: { "openai/fileParams": ["file"] },
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        tipo: { type: "string", enum: ["planimetria", "computo"] },
        file: {
          type: "object",
          description: "Il file allegato in chat",
          properties: {
            download_url: { type: "string" }, file_id: { type: "string" },
            file_name: { type: "string" }, mime_type: { type: "string" },
          },
          required: ["download_url"],
        },
      },
      required: ["tipo", "file"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const file = (args.file ?? {}) as Record<string, unknown>;
      const indirizzo = str(file.download_url);
      let url: URL;
      try { url = new URL(indirizzo ?? ""); } catch { throw new ToolError("Il file non è arrivato: riallegalo e riprova."); }
      // Solo i file serviti da OpenAI: il server non scarica da indirizzi qualsiasi.
      if (url.protocol !== "https:" || !/(^|\.)(oaiusercontent\.com|openai\.com|chatgpt\.com)$/i.test(url.hostname)) {
        throw new ToolError("Indirizzo del file non ammesso.");
      }
      const tipo = str(args.tipo) === "computo" ? "computo" : "planimetria";
      const nome = (str(file.file_name) ?? "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
      const estensione = nome.split(".").pop()?.toLowerCase() ?? "";
      const ammesse = tipo === "computo" ? ["pdf", "xlsx", "xls", "xpwe", "dcf", "xml", "jpg", "jpeg", "png", "webp"]
        : ["pdf", "jpg", "jpeg", "png", "webp", "dwg", "dxf"];
      if (!ammesse.includes(estensione)) throw new ToolError(`Formato non ammesso per ${tipo}: ${ammesse.join(", ")}`);
      const risposta = await fetch(url.toString());
      if (!risposta.ok) throw new ToolError(`File non scaricabile (${risposta.status}): riallegalo e riprova.`);
      const dichiarati = Number(risposta.headers.get("content-length") ?? 0);
      if (dichiarati > 50 * 1024 * 1024) throw new ToolError("Il file supera 50 MB.");
      const byte = new Uint8Array(await risposta.arrayBuffer());
      if (byte.byteLength > 50 * 1024 * 1024) throw new ToolError("Il file supera 50 MB.");
      const bucket = tipo === "computo" ? "computi" : "planimetrie";
      const percorso = tipo === "computo" ? `${az.id}/${Date.now()}-${nome}` : `${az.id}/assistente/${crypto.randomUUID()}-${nome}`;
      const { error } = await admin.storage.from(bucket).upload(percorso, byte, {
        contentType: str(file.mime_type) ?? risposta.headers.get("content-type") ?? undefined,
      });
      if (error) throw new ToolError(`File non salvato: ${error.message}`);
      return { caricato: true, percorso, bucket, nome, dimensione_kb: Math.round(byte.byteLength / 1024) };
    },
  },
  {
    name: "leggi_file_caricato",
    description: "Legge il testo di un PDF caricato con link_caricamento (planimetrie con quote e legenda, capitolati, computi in PDF). Le pagine scansionate passano dall'OCR (crediti AI dell'azienda).",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, percorso: { type: "string" }, bucket: { type: "string", enum: ["planimetrie", "computi"] } },
      required: ["percorso", "bucket"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const percorso = str(args.percorso) ?? "";
      if (!percorso.startsWith(`${az.id}/`)) throw new ToolError("Il file non è di questa azienda");
      const esito = await funzioneInterna("silvio-extract-pdf", {
        company_id: az.id, per_utente: ctx.created_by, storage_path: percorso, bucket: str(args.bucket), max_chars: 60000,
      });
      return { testo: esito.text ?? "", pagine: esito.pages_count ?? null, troncato: esito.truncated === true };
    },
  },
  {
    name: "importa_computo",
    description: "Importa un computo metrico caricato con link_caricamento: lo legge (PriMus/XPWE senza AI, gli altri con l'AI) e abbina le voci al listino dell'azienda. Restituisce le voci da rivedere; poi crea_preventivo.",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, percorso: { type: "string" }, nome_file: { type: "string" } },
      required: ["percorso"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const percorso = str(args.percorso) ?? "";
      if (!percorso.startsWith(`${az.id}/`)) throw new ToolError("Il file non è di questa azienda");
      if (!ctx.tokenUtente) throw new ToolError("Disponibile solo collegando l'assistente con l'accesso (Claude.ai o ChatGPT).");
      const nome = str(args.nome_file) ?? percorso.split("/").pop() ?? "computo";
      const estensione = nome.split(".").pop()?.toLowerCase() ?? "";
      const tipi: Record<string, string> = { pdf: "pdf", xlsx: "xlsx", xls: "xls", xpwe: "xpwe", dcf: "xpwe", xml: "xpwe", jpg: "image", jpeg: "image", png: "image", webp: "image" };
      if (!tipi[estensione]) throw new ToolError("Formato non supportato: PDF, Excel, XPWE o immagini.");
      const { data: upload, error } = await admin.from("computo_uploads").insert({
        company_id: az.id, uploaded_by: ctx.created_by, file_name: nome, file_type: tipi[estensione],
        storage_path: percorso, extraction_status: "uploading",
      }).select("id").single();
      if (error) throw new ToolError(`Computo non registrato: ${error.message}`);
      await funzioneComeUtente(ctx, "computo-ai-extract", { computoUploadId: upload.id });
      const { data: voci } = await admin.from("computo_voci_estratte")
        .select("codice_voce, descrizione_breve, unita_misura, quantita, prezzo_unitario_computo, prezzo_unitario_impresa, matched_name, capitolo_nome")
        .eq("computo_upload_id", upload.id).eq("company_id", az.id).order("ordine").limit(300);
      return {
        computo_id: upload.id, voci: voci ?? [],
        nota: "prezzo_unitario_impresa = prezzo dal listino dell'azienda quando trovato.",
      };
    },
  },
];
