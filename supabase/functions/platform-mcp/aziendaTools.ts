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

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type KeyCtx, type ToolDef, ToolError, resolveCompany, UUID_RE, str, num, intLimit } from "./lib.ts";
import { SILVIO_TOOLS as STRUMENTI_SILVIO } from "../_shared/silvioTools.ts";
import { planimetriaDaSopralluogo } from "../planimetria-genera/daSopralluogo.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

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

/** Il database visto dall'utente collegato (OAuth): valgono le sue regole sulle righe e
 *  auth.uid() è lui. Serve per le scritture che nell'app partono dal browser. */
function clienteUtente(ctx: KeyCtx): SupabaseClient {
  if (!ctx.tokenUtente) {
    throw new ToolError("Disponibile solo collegando l'assistente con l'accesso (Claude.ai o ChatGPT), non con una chiave API.");
  }
  return createClient(URL_BASE, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: `Bearer ${ctx.tokenUtente}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

// ── Quello che mancava (25/11/2026 sera) ─────────────────────────────────────
// Modificare preventivi, trasformarli in commessa, disegnare la pianta, fatture,
// fasi, contatti, email e WhatsApp. Quasi tutte queste strade nell'app partono dal
// browser con l'utente: qui passano da clienteUtente / funzioneComeUtente, così
// valgono le sue regole. Funzionano con i collegamenti OAuth (Claude.ai, ChatGPT).

const r2 = (n: number) => Math.round(n * 100) / 100;
const giornoValido = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function commessaDa(admin: SupabaseClient, companyId: string, raw: unknown) {
  const testo = str(raw);
  if (!testo) throw new ToolError('Parametro "commessa" obbligatorio (codice, es. GE-0012, o UUID)');
  const q = admin.from("orders").select("id, order_code, title").eq("company_id", companyId);
  const { data } = UUID_RE.test(testo) ? await q.eq("id", testo).limit(1) : await q.ilike("order_code", testo).limit(2);
  if (!data || data.length === 0) throw new ToolError(`Commessa «${testo}» non trovata`);
  if (data.length > 1) throw new ToolError(`Più commesse corrispondono a «${testo}»: usa il codice esatto.`);
  return data[0] as { id: string; order_code: string | null; title: string | null };
}

const VOCE_MODIFICA = {
  type: "object",
  properties: {
    id: { type: "string", description: "UUID della voce (da pdf/riepilogo) oppure usa nome" },
    nome: { type: "string" }, quantita: { type: "number" }, prezzo_unitario: { type: "number" },
    sconto: { type: "number" }, iva: { type: "number" }, descrizione: { type: "string" },
  },
  additionalProperties: false,
};

export const COMPLETI_TOOLS: ToolDef[] = [
  {
    name: "voci_preventivo",
    description: "Le voci di un preventivo (id, nome, quantità, prezzo, IVA, sconto): servono per modificarle.",
    scope: "quotes:read",
    inputSchema: { type: "object", properties: { company: { type: "string" }, preventivo: { type: "string" } }, required: ["preventivo"], additionalProperties: false },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const p = await preventivoDa(admin, az.id, args.preventivo);
      const { data, error } = await admin.from("quote_items")
        .select("id, name, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate, item_type, is_optional")
        .eq("quote_id", p.id).eq("company_id", az.id).order("sort_order");
      if (error) throw new ToolError(error.message);
      return { preventivo: p.quote_number, stato: p.status, totale: p.total, voci: data ?? [] };
    },
  },
  {
    name: "modifica_voci_preventivo",
    description: "Modifica le voci di un preventivo esistente: aggiunge, toglie, cambia quantità/prezzo/sconto/IVA. Le voci non toccate restano come sono (anche il legame col listino). Mostra le modifiche e chiedi conferma.",
    scope: "quotes:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, preventivo: { type: "string" },
        aggiungi: { type: "array", items: VOCE },
        togli: { type: "array", items: { type: "string" }, description: "UUID o nome esatto delle voci da togliere" },
        cambia: { type: "array", items: VOCE_MODIFICA },
      },
      required: ["preventivo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const p = await preventivoDa(admin, az.id, args.preventivo);
      const { data: righe, error } = await admin.from("quote_items").select("*").eq("quote_id", p.id).eq("company_id", az.id).order("sort_order");
      if (error) throw new ToolError(error.message);
      const corrisponde = (r: Record<string, unknown>, chiave: string) => r.id === chiave || String(r.name ?? "").toLowerCase() === chiave.toLowerCase();
      const togli = ((args.togli ?? []) as string[]).map((t) => String(t));
      const cambia = (args.cambia ?? []) as Record<string, unknown>[];
      for (const c of cambia) {
        const chiave = str(c.id) ?? str(c.nome);
        if (!chiave || !(righe ?? []).some((r) => corrisponde(r, chiave))) throw new ToolError(`Voce da cambiare non trovata: ${chiave ?? "(senza id né nome)"}`);
      }
      for (const t of togli) if (!(righe ?? []).some((r) => corrisponde(r, t))) throw new ToolError(`Voce da togliere non trovata: ${t}`);
      const restanti = (righe ?? []).filter((r) => !togli.some((t) => corrisponde(r, t)));
      // Le voci esistenti tornano com'erano (legami col listino, misure, gerarchia), con i soli campi cambiati.
      const items = restanti.map((r) => {
        const modifica = cambia.find((c) => corrisponde(r, str(c.id) ?? str(c.nome) ?? ""));
        return {
          client_temp_id: r.id, parent_temp_id: r.parent_item_id ?? null,
          item_type: r.item_type, name: str(modifica?.nome) ?? r.name, description: str(modifica?.descrizione) ?? r.description,
          quantity: num(modifica?.quantita) ?? r.quantity, unit_price: num(modifica?.prezzo_unitario) ?? r.unit_price,
          discount_percent: num(modifica?.sconto) ?? r.discount_percent ?? 0, vat_rate: num(modifica?.iva) ?? r.vat_rate ?? 22,
          unit_of_measure: r.unit_of_measure, article_template_id: r.article_template_id, item_category: r.item_category,
          tariffa_id: r.tariffa_id, prezzo_acquisto: r.prezzo_acquisto ?? 0, mostra_nel_pdf: r.mostra_nel_pdf ?? true,
          is_optional: r.is_optional ?? false, misura_x: r.misura_x, misura_y: r.misura_y, family_id: r.family_id,
          axis_selections: r.axis_selections, supplier_catalog_id: r.supplier_catalog_id,
          supplier_product_line_id: r.supplier_product_line_id, computo_voce_id: r.computo_voce_id, analisi_riga_id: r.analisi_riga_id,
        };
      });
      for (const v of (args.aggiungi ?? []) as Record<string, unknown>[]) {
        items.push({
          client_temp_id: crypto.randomUUID(), parent_temp_id: null, item_type: str(v.tipo) ?? "other", name: str(v.nome),
          description: str(v.descrizione), quantity: num(v.quantita), unit_price: num(v.prezzo_unitario), discount_percent: 0,
          vat_rate: num(v.iva) ?? 22, unit_of_measure: str(v.unita) ?? "pz", article_template_id: null, item_category: null,
          tariffa_id: null, prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false, misura_x: null, misura_y: null,
          family_id: null, axis_selections: null, supplier_catalog_id: null, supplier_product_line_id: null, computo_voce_id: null,
          analisi_riga_id: null,
        });
      }
      if (items.length === 0) throw new ToolError("Il preventivo resterebbe senza voci.");
      const { data, error: errSalva } = await clienteUtente(ctx).rpc("save_quote_items_atomic", { p_quote_id: p.id, p_company_id: az.id, p_items: items });
      if (errSalva) throw new ToolError(errSalva.message);
      const { data: dopo } = await admin.from("quotes").select("subtotal, vat_amount, total").eq("id", p.id).maybeSingle();
      return { preventivo: p.quote_number, voci: items.length, totali: dopo, esito: data };
    },
  },
  {
    name: "trasforma_preventivo_in_commessa",
    description: "Trasforma un preventivo ACCETTATO in commessa (con le stesse regole del pulsante dell'app). Chiedi conferma prima.",
    scope: "orders:write",
    conferma: true,
    inputSchema: { type: "object", properties: { company: { type: "string" }, preventivo: { type: "string" } }, required: ["preventivo"], additionalProperties: false },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const p = await preventivoDa(admin, az.id, args.preventivo);
      if (p.status !== "accettata") throw new ToolError(`Il preventivo ${p.quote_number} è «${p.status}»: si trasforma in commessa solo quando è accettato.`);
      const esito = await funzioneComeUtente(ctx, "converti-preventivo-cantiere", { quote_id: p.id });
      return { preventivo: p.quote_number, ...esito };
    },
  },
  {
    name: "disegna_planimetria",
    description: "Disegna una planimetria nel modulo Planimetrie: dalle stanze con i mq (gratis) oppure da una descrizione a parole (1 credito render). Può collegarla a un preventivo o a una commessa.",
    scope: "quotes:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, titolo: { type: "string" },
        stanze: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, mq: { type: "number" }, altezza: { type: "number" } }, required: ["nome", "mq"] } },
        descrizione: { type: "string", description: "In alternativa alle stanze: «trilocale 75 mq, bagno 2x2,5…»" },
        preventivo: { type: "string" }, commessa: { type: "string" },
      },
      required: ["titolo"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const stanze = Array.isArray(args.stanze) ? args.stanze as Record<string, unknown>[] : [];
      let documento: unknown;
      let origine: string;
      if (stanze.length) {
        try {
          documento = planimetriaDaSopralluogo(stanze.map((s) => ({ nome: str(s.nome) ?? "Locale", superficie_mq: num(s.mq), altezza_m: num(s.altezza) })), "assistente AI").planimetria;
        } catch (e) { throw new ToolError(e instanceof Error ? e.message : "Stanze non valide"); }
        origine = "sopralluogo";
      } else if (str(args.descrizione)) {
        const esito = await funzioneComeUtente(ctx, "planimetria-genera", { company_id: az.id, ingresso: "descrizione", testo: str(args.descrizione) });
        if (esito.success === false || !esito.planimetria) throw new ToolError(String(esito.messaggio ?? "Pianta non generata"));
        documento = esito.planimetria;
        origine = "ai_testo";
      } else {
        throw new ToolError("Servono le stanze con i mq oppure una descrizione.");
      }
      const preventivo = str(args.preventivo) ? await preventivoDa(admin, az.id, args.preventivo) : null;
      const commessa = str(args.commessa) ? await commessaDa(admin, az.id, args.commessa) : null;
      const { data, error } = await clienteUtente(ctx).rpc("planimetria_crea", {
        p_company_id: az.id, p_titolo: str(args.titolo), p_documento: documento,
        p_quantita: calcolaQuantita(documento as Parameters<typeof calcolaQuantita>[0]), p_origine: origine,
        p_nota: "Creata dall'assistente AI", p_quote_id: preventivo?.id ?? null, p_order_id: commessa?.id ?? null,
      });
      if (error) throw new ToolError(error.message);
      return { planimetria_id: data, apri: `${URL_APP}/azienda/planimetrie/${data}`, origine };
    },
  },
  {
    name: "crea_bozza_fattura",
    description: "Crea una fattura in BOZZA (non emessa, non inviata): cliente dall'anagrafica, righe, IVA, scadenza; facoltativo il legame a una commessa. Mostra righe e totali e chiedi conferma.",
    scope: "orders:write",
    conferma: true,
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        cliente: { type: "string", description: "Ragione sociale, P.IVA o UUID dell'anagrafica" },
        tipo: { type: "string", enum: ["fattura", "fattura_pa"] },
        commessa: { type: "string" },
        righe: {
          type: "array", minItems: 1, maxItems: 100,
          items: {
            type: "object",
            properties: {
              descrizione: { type: "string" }, quantita: { type: "number" }, unita: { type: "string" },
              prezzo_unitario: { type: "number" }, iva: { type: "number", enum: [22, 10, 5, 4, 0] },
              natura: { type: "string", description: "Obbligatoria con IVA 0 (es. N6.3 inversione contabile edilizia)" },
            },
            required: ["descrizione", "quantita", "prezzo_unitario", "iva"],
            additionalProperties: false,
          },
        },
        scadenza: { type: "string", description: "YYYY-MM-DD" },
        note: { type: "string" },
      },
      required: ["cliente", "righe"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const testo = str(args.cliente)!;
      const q = admin.from("anagrafiche_native").select("id, ragione_sociale, nome, cognome, partita_iva, codice_fiscale, codice_sdi, pec, indirizzo_via, indirizzo_cap, indirizzo_comune, indirizzo_provincia, indirizzo_nazione, codice_ipa")
        .eq("company_id", az.id);
      const { data: trovati } = UUID_RE.test(testo) ? await q.eq("id", testo).limit(1)
        : /^\d{11}$/.test(testo) ? await q.eq("partita_iva", testo).limit(2) : await q.ilike("ragione_sociale", `%${testo}%`).limit(3);
      if (!trovati?.length) throw new ToolError(`Cliente «${testo}» non trovato in anagrafica: crealo dall'app o usa la P.IVA.`);
      if (trovati.length > 1) throw new ToolError(`Più clienti: ${trovati.map((t) => t.ragione_sociale).join(", ")}. Usa la P.IVA.`);
      const c = trovati[0];
      const tipo = str(args.tipo) === "fattura_pa" ? "fattura_pa" : "fattura";
      const righe = (args.righe as Record<string, unknown>[]).map((r, i) => {
        const aliquota = num(r.iva) ?? 22;
        if (aliquota === 0 && !str(r.natura)) throw new ToolError(`Riga ${i + 1}: con IVA 0 serve la natura (es. N6.3).`);
        const imponibile = r2((num(r.quantita) ?? 0) * (num(r.prezzo_unitario) ?? 0));
        const imposta = r2(imponibile * aliquota / 100);
        return {
          id: crypto.randomUUID(), numero_linea: i + 1, descrizione: str(r.descrizione), quantita: num(r.quantita),
          unita_misura: str(r.unita) ?? "pz", prezzo_unitario: num(r.prezzo_unitario), imponibile,
          aliquota_iva: aliquota.toFixed(2), ...(str(r.natura) ? { natura_iva: str(r.natura) } : {}), imposta, totale_riga: r2(imponibile + imposta),
        };
      });
      const gruppi = new Map<string, { aliquota: string; natura?: string; imponibile: number; imposta: number }>();
      for (const r of righe) {
        const chiave = `${r.aliquota_iva}|${(r as { natura_iva?: string }).natura_iva ?? ""}`;
        const g = gruppi.get(chiave) ?? { aliquota: r.aliquota_iva, ...((r as { natura_iva?: string }).natura_iva ? { natura: (r as { natura_iva?: string }).natura_iva } : {}), imponibile: 0, imposta: 0 };
        g.imponibile = r2(g.imponibile + r.imponibile); g.imposta = r2(g.imposta + r.imposta); gruppi.set(chiave, g);
      }
      const riepilogo = [...gruppi.values()].map((g) => ({ ...g, esigibilita: "I" }));
      const imponibileTot = r2(righe.reduce((s, r) => s + r.imponibile, 0));
      const ivaTot = r2(righe.reduce((s, r) => s + r.imposta, 0));
      const totale = r2(imponibileTot + ivaTot);
      const scadenza = giornoValido(args.scadenza);
      const commessa = str(args.commessa) ? await commessaDa(admin, az.id, args.commessa) : null;
      const dati = {
        tipo, anagrafica_id: c.id, ordine_id: commessa?.id ?? null, note_documento: str(args.note),
        cliente_snapshot: {
          ragione_sociale: c.ragione_sociale ?? [c.nome, c.cognome].filter(Boolean).join(" "), nome: c.nome, cognome: c.cognome,
          partita_iva: c.partita_iva, codice_fiscale: c.codice_fiscale, codice_sdi: tipo === "fattura_pa" ? c.codice_ipa ?? c.codice_sdi : c.codice_sdi,
          pec: c.pec, indirizzo_via: c.indirizzo_via, indirizzo_cap: c.indirizzo_cap, indirizzo_comune: c.indirizzo_comune,
          indirizzo_provincia: c.indirizzo_provincia, indirizzo_nazione: c.indirizzo_nazione ?? "IT",
          tipo_cliente: tipo === "fattura_pa" ? "PA" : c.partita_iva ? "B2B" : "B2C",
        },
        righe, riepilogo_iva: riepilogo, subtotale: imponibileTot, imponibile_totale: imponibileTot, iva_totale: ivaTot,
        arrotondamento: 0, totale_documento: totale, totale_da_pagare: totale, metodo_pagamento_codice: "MP05",
        ...(scadenza ? { data_scadenza: scadenza, scadenze_pagamento: [{ numero_rata: 1, data_scadenza: scadenza, importo: totale, metodo_pagamento: "MP05", pagato: false }] } : {}),
      };
      const utente = clienteUtente(ctx);
      const { data, error } = await utente.rpc("documento_crea", { p_company_id: az.id, p_dati: dati });
      if (error) throw new ToolError(error.message);
      const doc = (data ?? {}) as Record<string, unknown>;
      if (commessa && typeof doc.id === "string") {
        await utente.from("fattura_ordine").insert({ company_id: az.id, fattura_id: doc.id, ordine_id: commessa.id, importo_associato: totale });
      }
      return { bozza: doc.numero, id: doc.id, cliente: dati.cliente_snapshot.ragione_sociale, imponibile: imponibileTot, iva: ivaTot, totale,
        apri: typeof doc.id === "string" ? `${URL_APP}/azienda/documenti/${doc.id}` : null,
        nota: "È una bozza: controllala nell'app; per emetterla e mandarla allo SdI usa emetti_fattura." };
    },
  },
  {
    name: "emetti_fattura",
    description: "Emette una fattura in bozza (numero vero, data di oggi) e, se richiesto, la manda allo SdI. Irreversibile: mostra numero, cliente e totale e chiedi conferma esplicita.",
    scope: "actions:sensitive",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string" }, fattura_id: { type: "string" }, invia_sdi: { type: "boolean" } },
      required: ["fattura_id"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const id = str(args.fattura_id) ?? "";
      if (!UUID_RE.test(id)) throw new ToolError("fattura_id: serve l'UUID della bozza");
      const { data: doc } = await admin.from("documenti_fiscali").select("id, stato, righe, cliente_snapshot, totale_documento")
        .eq("id", id).eq("company_id", az.id).is("deleted_at", null).maybeSingle();
      if (!doc) throw new ToolError("Fattura non trovata in questa azienda");
      if (!Array.isArray(doc.righe) || doc.righe.length === 0) throw new ToolError("La fattura non ha righe.");
      if (!(doc.cliente_snapshot as Record<string, unknown> | null)?.ragione_sociale) throw new ToolError("Manca la ragione sociale del cliente.");
      const utente = clienteUtente(ctx);
      if (doc.stato === "bozza") {
        const { error } = await utente.rpc("documento_emetti_oggi", { p_documento_id: id });
        if (error) throw new ToolError(error.message);
      }
      const { data: emessa } = await admin.from("documenti_fiscali").select("numero, stato").eq("id", id).maybeSingle();
      let sdi: unknown = null;
      if (args.invia_sdi === true) sdi = await funzioneComeUtente(ctx, "invia-sdi", { documento_id: id });
      return { numero: emessa?.numero, stato: emessa?.stato, totale: doc.totale_documento, sdi };
    },
  },
  {
    name: "aggiorna_fase_commessa",
    description: "Aggiorna una fase di una commessa: stato (da_iniziare, in_corso, completata), percentuale, date di inizio e fine, note.",
    scope: "orders:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, commessa: { type: "string" }, fase: { type: "string", description: "Nome della fase" },
        stato: { type: "string", enum: ["da_iniziare", "in_corso", "completata"] },
        percentuale: { type: "number", minimum: 0, maximum: 100 },
        data_inizio: { type: "string" }, data_fine: { type: "string" }, note: { type: "string" },
      },
      required: ["commessa", "fase"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const o = await commessaDa(admin, az.id, args.commessa);
      const nomeFase = str(args.fase)!.toLowerCase();
      const { data: fasi } = await admin.from("order_work_phases").select("id, name").eq("order_id", o.id);
      const trovate = (fasi ?? []).filter((f) => String(f.name).toLowerCase() === nomeFase);
      const simili = trovate.length ? trovate : (fasi ?? []).filter((f) => String(f.name).toLowerCase().includes(nomeFase));
      if (simili.length !== 1) throw new ToolError(simili.length ? `Più fasi: ${simili.map((f) => f.name).join(", ")}` : `Fase non trovata. Fasi: ${(fasi ?? []).map((f) => f.name).join(", ")}`);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const stato = str(args.stato);
      if (stato) {
        patch.status = stato;
        patch.completata_il = stato === "completata" ? new Date().toISOString() : null;
        patch.completata_da = stato === "completata" ? ctx.created_by : null;
      }
      if (num(args.percentuale) != null) patch.percentuale = num(args.percentuale);
      if (giornoValido(args.data_inizio)) patch.start_date = giornoValido(args.data_inizio);
      if (giornoValido(args.data_fine)) patch.end_date = giornoValido(args.data_fine);
      if (str(args.note)) patch.notes = str(args.note);
      const { data, error } = await clienteUtente(ctx).from("order_work_phases").update(patch).eq("id", simili[0].id).select("id");
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Non puoi modificare questa fase.");
      return { commessa: o.order_code, fase: simili[0].name, aggiornata: Object.keys(patch).filter((k) => k !== "updated_at") };
    },
  },
  {
    name: "modifica_contatto",
    description: "Modifica un contatto del CRM: nome, cognome, email, telefono, azienda, città, note.",
    scope: "contacts:write",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, contatto_id: { type: "string" },
        nome: { type: "string" }, cognome: { type: "string" }, email: { type: "string" }, telefono: { type: "string" },
        azienda: { type: "string" }, citta: { type: "string" }, note: { type: "string" },
      },
      required: ["contatto_id"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const id = str(args.contatto_id) ?? "";
      if (!UUID_RE.test(id)) throw new ToolError("contatto_id: serve l'UUID (da cerca_contatti)");
      const mappa: Record<string, string> = { nome: "first_name", cognome: "last_name", email: "email", telefono: "phone", azienda: "company_name", citta: "city", note: "notes" };
      const patch: Record<string, unknown> = {};
      for (const [chiave, colonna] of Object.entries(mappa)) if (str(args[chiave]) !== null) patch[colonna] = str(args[chiave])!.slice(0, 1000);
      if (!Object.keys(patch).length) throw new ToolError("Niente da modificare.");
      patch.updated_at = new Date().toISOString();
      const { data, error } = await clienteUtente(ctx).from("marketing_contacts").update(patch).eq("id", id).eq("company_id", az.id).select("id");
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Contatto non trovato o non puoi modificarlo.");
      return { contatto_id: id, modificati: Object.keys(patch).filter((k) => k !== "updated_at") };
    },
  },
  {
    name: "email_conversazioni",
    description: "Le conversazioni email della TUA casella collegata (non quelle dei colleghi): mittente, oggetto, data, letta.",
    scope: "email:read",
    inputSchema: {
      type: "object",
      properties: { cerca: { type: "string" }, non_lette: { type: "boolean" }, limite: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    handler: async (_admin, ctx, args) => {
      const { data, error } = await clienteUtente(ctx).rpc("email_list_threads", {
        p_folder: "inbox", p_search_text: str(args.cerca), p_is_unread: args.non_lette === true, p_limit: intLimit(args.limite, 20, 100),
      });
      if (error) throw new ToolError(error.message);
      return { conversazioni: data ?? [] };
    },
  },
  {
    name: "leggi_email",
    description: "Legge una conversazione email della tua casella (thread_id da email_conversazioni).",
    scope: "email:read",
    inputSchema: { type: "object", properties: { thread_id: { type: "string" } }, required: ["thread_id"], additionalProperties: false },
    handler: async (_admin, ctx, args) => {
      const { data, error } = await clienteUtente(ctx).from("email_inbox")
        .select("id, from_name, from_email, to_email, subject, received_at, raw_text")
        .eq("thread_id", str(args.thread_id)).eq("user_id", ctx.created_by).order("received_at").limit(30);
      if (error) throw new ToolError(error.message);
      return { messaggi: (data ?? []).map((m) => ({ ...m, raw_text: String(m.raw_text ?? "").slice(0, 6000) })) };
    },
  },
  {
    name: "rispondi_email",
    description: "Risponde a una conversazione email della tua casella, dal tuo indirizzo. Invio REALE: mostra testo e destinatario e chiedi conferma.",
    scope: "email:send",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string" }, testo: { type: "string" } },
      required: ["thread_id", "testo"],
      additionalProperties: false,
    },
    handler: async (_admin, ctx, args) => {
      const utente = clienteUtente(ctx);
      const { data: ultimi, error } = await utente.from("email_inbox")
        .select("id, company_id, from_email, subject, oauth_connection_id, thread_id")
        .eq("thread_id", str(args.thread_id)).eq("user_id", ctx.created_by).order("received_at", { ascending: false }).limit(1);
      if (error) throw new ToolError(error.message);
      const ultimo = ultimi?.[0];
      if (!ultimo) throw new ToolError("Conversazione non trovata nella tua casella");
      if (!ultimo.oauth_connection_id) throw new ToolError("La casella di questa conversazione non è collegata per l'invio.");
      const testo = str(args.testo)!;
      const oggetto = /^re:/i.test(String(ultimo.subject ?? "")) ? ultimo.subject : `Re: ${ultimo.subject ?? ""}`;
      const html = `<div style="font-family:sans-serif;white-space:pre-wrap">${testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
      const { data: uscita, error: errUscita } = await utente.from("email_outbox").insert({
        user_id: ctx.created_by, company_id: ultimo.company_id, oauth_connection_id: ultimo.oauth_connection_id,
        thread_id: ultimo.thread_id, in_reply_to_id: ultimo.id, to_emails: [ultimo.from_email], cc_emails: [], bcc_emails: [],
        subject: oggetto, body_text: testo, body_html: html, attachments: [], status: "queued",
      }).select("id").single();
      if (errUscita) throw new ToolError(errUscita.message);
      const esito = await funzioneComeUtente(ctx, "email-send", { outbox_id: uscita.id });
      return { inviata_a: ultimo.from_email, oggetto, esito };
    },
  },
  {
    name: "conversazioni_whatsapp",
    description: "Le conversazioni WhatsApp dell'azienda (ultimo messaggio, contatto o cliente, bot in pausa).",
    scope: "contacts:read",
    inputSchema: { type: "object", properties: { company: { type: "string" } }, additionalProperties: false },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const { data, error } = await clienteUtente(ctx).rpc("conversazioni_lista", { p_company_id: az.id });
      if (error) throw new ToolError(error.message);
      return { azienda: az.name, conversazioni: Array.isArray(data) ? data.slice(0, 60) : data };
    },
  },
  {
    name: "leggi_whatsapp",
    description: "I messaggi (WhatsApp, email, chiamate) con un contatto del CRM o un cliente.",
    scope: "contacts:read",
    inputSchema: {
      type: "object",
      properties: { tipo: { type: "string", enum: ["contatto", "cliente"] }, id: { type: "string" } },
      required: ["tipo", "id"],
      additionalProperties: false,
    },
    handler: async (_admin, ctx, args) => {
      const { data, error } = await clienteUtente(ctx).rpc("conversazione_timeline", { p_entita_tipo: str(args.tipo), p_entita_id: str(args.id) });
      if (error) throw new ToolError(error.message);
      return { messaggi: data };
    },
  },
  {
    name: "invia_whatsapp",
    description: "Manda un WhatsApp dal numero dell'azienda. Testo libero solo entro 24 ore dall'ultimo messaggio del cliente; oltre serve un modello approvato (template). Invio REALE: mostra numero e testo e chiedi conferma.",
    scope: "actions:sensitive",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        telefono: { type: "string", description: "Con prefisso internazionale, es. 393331234567" },
        testo: { type: "string" },
        modello: { type: "object", properties: { nome: { type: "string" }, lingua: { type: "string" }, variabili: { type: "array", items: { type: "string" } } }, required: ["nome"] },
        contatto_id: { type: "string" },
      },
      required: ["telefono"],
      additionalProperties: false,
    },
    handler: async (admin, ctx, args) => {
      const az = await resolveCompany(admin, ctx, args);
      const telefono = (str(args.telefono) ?? "").replace(/[^\d]/g, "");
      if (telefono.length < 8) throw new ToolError("Numero non valido");
      const modello = args.modello as Record<string, unknown> | undefined;
      if (!str(args.testo) && !modello) throw new ToolError("Serve il testo o un modello");
      const esito = await funzioneInterna("whatsapp-send", {
        company_id: az.id, to: telefono, idempotency_key: crypto.randomUUID(),
        ...(UUID_RE.test(str(args.contatto_id) ?? "") ? { contact_id: str(args.contatto_id) } : {}),
        ...(modello
          ? { template: { name: str(modello.nome), language: str(modello.lingua) ?? "it", variables: Array.isArray(modello.variabili) ? modello.variabili : [] } }
          : { text: { body: str(args.testo) } }),
      });
      return { inviato_a: telefono, esito };
    },
  },
];
