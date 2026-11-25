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
      // Niente reindirizzamenti (il dominio controllato è quello vero), 60 secondi al massimo,
      // e la lettura si ferma a 50 MB anche se il server non dichiara la dimensione.
      const MASSIMO = 50 * 1024 * 1024;
      const risposta = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(60_000) })
        .catch(() => { throw new ToolError("File non scaricabile: riallegalo e riprova."); });
      if (!risposta.ok || !risposta.body) throw new ToolError(`File non scaricabile (${risposta.status}): riallegalo e riprova.`);
      if (Number(risposta.headers.get("content-length") ?? 0) > MASSIMO) throw new ToolError("Il file supera 50 MB.");
      const pezzi: Uint8Array[] = [];
      let totale = 0;
      const lettore = risposta.body.getReader();
      for (;;) {
        const { done, value } = await lettore.read();
        if (done) break;
        totale += value.byteLength;
        if (totale > MASSIMO) { await lettore.cancel(); throw new ToolError("Il file supera 50 MB."); }
        pezzi.push(value);
      }
      const byte = new Uint8Array(totale);
      let posizione = 0;
      for (const pezzo of pezzi) { byte.set(pezzo, posizione); posizione += pezzo.byteLength; }
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
      // file_size è obbligatorio: si legge dall'archivio (il file c'è già, caricato prima).
      const cartella = percorso.slice(0, percorso.lastIndexOf("/"));
      const nomeNelBucket = percorso.slice(percorso.lastIndexOf("/") + 1);
      const { data: elenco } = await admin.storage.from("computi").list(cartella, { search: nomeNelBucket, limit: 5 });
      const oggetto = (elenco ?? []).find((o) => o.name === nomeNelBucket);
      if (!oggetto) throw new ToolError("Il file non c'è ancora: caricalo con link_caricamento o carica_file_dalla_chat (tipo computo).");
      const dimensione = Number((oggetto.metadata as Record<string, unknown> | null)?.size ?? 0);
      const { data: upload, error } = await admin.from("computo_uploads").insert({
        company_id: az.id, uploaded_by: ctx.created_by, file_name: nome, file_type: tipi[estensione],
        file_size: dimensione, storage_path: percorso, extraction_status: "uploading",
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

// ── Ponte verso gli strumenti di Silvio (25/11/2026) ─────────────────────────
// Fatture, rapportini, giornale, commessa: Silvio li fa già. Qui si espongono i
// suoi esecutori con la sua descrizione dei parametri. Chi può usarli lo dice
// permessiStrumenti.ts (quelli che Silvio riserva agli amministratori lì non ci
// sono: per i dipendenti restano chiusi).
interface Ponte { mcp: string; silvio: string; scope: string; conferma?: boolean; descrizione: string }
const PONTI: Ponte[] = [
  { mcp: "fatture_ricevute", silvio: "get_received_invoices", scope: "stats:read",
    descrizione: "Fatture passive dei fornitori, da pagare e pagate, con scadenze." },
  { mcp: "fatture_da_registrare", silvio: "fatture_da_registrare", scope: "stats:read",
    descrizione: "Fatture e DDT dei fornitori letti dalle email, in attesa di essere registrati." },
  { mcp: "rate_da_incassare", silvio: "lista_fatture_restanti", scope: "stats:read",
    descrizione: "Rate e importi residui delle commesse (una rata non è una fattura)." },
  { mcp: "quadro_commessa", silvio: "quadro_commessa", scope: "orders:read",
    descrizione: "Quadro operativo di una commessa: fasi, date, avanzamento, ritardi, chi lavora." },
  { mcp: "report_commessa", silvio: "report_commessa", scope: "orders:read",
    descrizione: "Report economico di una commessa (venduto, costi, margine) dal consuntivo ufficiale." },
  { mcp: "rate_commessa", silvio: "rate_commessa", scope: "orders:read",
    descrizione: "Piano rate di una commessa: incassato, residuo, scaduto, rate agganciate agli eventi." },
  { mcp: "registra_rapportino", silvio: "registra_rapportino", scope: "orders:write", conferma: true,
    descrizione: "Registra un rapportino su una commessa (ore e lavori). Chiedi conferma prima." },
  { mcp: "approva_rapportini", silvio: "approva_rapportini", scope: "orders:write", conferma: true,
    descrizione: "Approva o rifiuta i rapportini inviati dagli operai. Chiedi conferma prima." },
  { mcp: "genera_giornale_cantiere", silvio: "genera_giornale_cantiere", scope: "orders:write",
    descrizione: "Genera il giornale di cantiere di un giorno (rapportini, foto, DDT, presenze, meteo)." },
  { mcp: "aggiorna_stato_commessa", silvio: "aggiorna_stato_commessa", scope: "orders:write", conferma: true,
    descrizione: "Cambia lo stato di una commessa con la procedura dell'app. Chiedi conferma prima." },
  { mcp: "aggiungi_nota_commessa", silvio: "aggiungi_nota_commessa", scope: "orders:write",
    descrizione: "Aggiunge una nota interna al diario della commessa (mai inviata al cliente)." },
  { mcp: "registra_incasso_commessa", silvio: "registra_pagamento_commessa", scope: "orders:write", conferma: true,
    descrizione: "Registra un incasso su una commessa (rata pagata). Chiedi conferma con importo e data." },
  { mcp: "ore_assenze_dipendente", silvio: "calcola_ore_mese_dipendente", scope: "hr:read",
    descrizione: "Ore di ferie, malattia, permessi e 104 di un dipendente in un mese." },
  { mcp: "blocca_slot_calendario", silvio: "blocca_slot_calendario", scope: "appointments:write",
    descrizione: "Blocca uno slot in calendario (es. per un sopralluogo)." },
];

function schemaSilvio(nome: string): Record<string, unknown> {
  const parametri = (STRUMENTI_SILVIO[nome] as { schema?: { function?: { parameters?: Record<string, unknown> } } } | undefined)
    ?.schema?.function?.parameters ?? { type: "object", properties: {} };
  const proprieta = (parametri.properties as Record<string, unknown> | undefined) ?? {};
  return { ...parametri, type: "object", properties: { company: { type: "string" }, ...proprieta } };
}

export const PONTE_SILVIO_TOOLS: ToolDef[] = PONTI.map((p) => ({
  name: p.mcp,
  description: p.descrizione,
  scope: p.scope,
  conferma: p.conferma,
  get inputSchema() { return schemaSilvio(p.silvio); },
  handler: async (admin, ctx, args) => {
    const az = await resolveCompany(admin, ctx, args);
    const { company: _c, ...resto } = args;
    return { azienda: az.name, ...(await eseguiSilvio(admin, ctx, az.id, p.silvio, resto)) };
  },
}));

export const ALTRI_TOOLS: ToolDef[] = [
  {
    name: "fatture_emesse",
    description: "Fatture emesse (anche PA, proforma e note di credito): numero, data, cliente, totale, scadenza, pagato, stato SdI. Filtri per periodo, cliente, tipo.",
    scope: "stats:read",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        dal: { type: "string", description: "YYYY-MM-DD" }, al: { type: "string", description: "YYYY-MM-DD" },
        cliente: { type: "string", description: "Parte del nome del cliente" },
        tipo: { type: "string", enum: ["fattura", "fattura_pa", "proforma", "nota_credito"] },
        solo_non_pagate: { type: "boolean" },
        limite: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const giorno = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      let q = admin.from("documenti_fiscali")
        .select("numero, tipo, data_emissione, data_scadenza, cliente_snapshot, totale_documento, totale_da_pagare, importo_pagato, pagato_at, stato, sdi_stato")
        .eq("company_id", az.id).is("deleted_at", null)
        .in("tipo", str(args.tipo) ? [str(args.tipo)!] : ["fattura", "fattura_pa", "proforma", "nota_credito"])
        .order("data_emissione", { ascending: false }).limit(intLimit(args.limite, 50, 200));
      if (giorno(args.dal)) q = q.gte("data_emissione", giorno(args.dal)!);
      if (giorno(args.al)) q = q.lte("data_emissione", giorno(args.al)!);
      if (args.solo_non_pagate === true) q = q.is("pagato_at", null);
      const { data, error } = await q;
      if (error) throw new ToolError(error.message);
      const cerca = str(args.cliente)?.toLowerCase();
      const righe = (data ?? []).map((d) => {
        const c = (d.cliente_snapshot ?? {}) as Record<string, unknown>;
        const cliente = String(c.denominazione ?? c.ragione_sociale ?? [c.nome, c.cognome].filter(Boolean).join(" ") ?? "");
        return { numero: d.numero, tipo: d.tipo, data: d.data_emissione, scadenza: d.data_scadenza, cliente,
          totale: d.totale_documento, da_pagare: d.totale_da_pagare, pagato: d.importo_pagato, pagata_il: d.pagato_at,
          stato: d.stato, sdi: d.sdi_stato };
      }).filter((r) => !cerca || r.cliente.toLowerCase().includes(cerca));
      return { azienda: az.name, fatture: righe };
    },
  },
  {
    name: "agenda",
    description: "Appuntamenti in calendario fra due date (sopralluoghi, riunioni, consegne, visite cantiere).",
    scope: "appointments:read",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        dal: { type: "string", description: "YYYY-MM-DD (default oggi)" },
        al: { type: "string", description: "YYYY-MM-DD (default fra 7 giorni)" },
      },
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const oggi = new Date().toISOString().slice(0, 10);
      const fra7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const giorno = (v: unknown, def: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : def);
      const { data, error } = await admin.from("appointments")
        .select("title, appointment_date, appointment_time, appointment_end_time, appointment_type, status, formatted_address, assigned_to")
        .eq("company_id", az.id).gte("appointment_date", giorno(args.dal, oggi)).lte("appointment_date", giorno(args.al, fra7))
        .order("appointment_date").order("appointment_time").limit(200);
      if (error) throw new ToolError(error.message);
      return { azienda: az.name, appuntamenti: data ?? [] };
    },
  },
];
