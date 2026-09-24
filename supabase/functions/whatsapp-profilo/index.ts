/**
 * whatsapp-profilo — il profilo WhatsApp di un numero collegato: foto, info,
 * descrizione, indirizzo, email, siti e categoria (24/09/2026).
 *
 * Si legge e si scrive direttamente su WhatsApp, con il token che il cliente ci
 * ha dato collegando il numero (Embedded Signup): EiC non ne tiene una copia.
 *
 * Body: { company_id, wa_number_id, azione, profilo?, foto? }
 *  - "leggi" → { profilo, nome: { verificato, stato } | null }
 *  - "salva" → { profilo }: manda a Meta solo i campi cambiati, poi rilegge;
 *  - "foto"  → { profilo }: { foto: { base64, tipo } } già ritagliata a 640×640
 *              dall'app; si carica il file (Resumable Upload API), si applica
 *              l'handle al profilo e si rilegge.
 *
 * Solo amministratori dell'azienda e super admin, come per i template. Si lavora
 * SOLO sul numero chiesto: un ripiego su un altro numero dell'azienda
 * cambierebbe il profilo sbagliato.
 *
 * Le regole dei campi stanno in _shared/profiloWhatsApp.ts, le stesse
 * dell'app. Nei log: passo, id pubblici ed errore di Meta, mai il token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";
import {
  CAMPI_META_PROFILO,
  FOTO_PROFILO,
  corpoPerMeta,
  erroriProfilo,
  normalizzaProfilo,
  profiloDaMeta,
  type ProfiloWhatsApp,
} from "../_shared/profiloWhatsApp.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Meta ha rifiutato un passo: si dice quale e perché. */
class ErroreMeta extends Error {
  passo: string;
  dettagli: Record<string, unknown> | null;

  constructor(passo: string, dettagli: Record<string, unknown> | null) {
    const motivo = (dettagli?.error_user_msg as string) || (dettagli?.message as string) || "errore sconosciuto";
    super(`WhatsApp ha rifiutato la modifica: ${motivo}`);
    this.passo = passo;
    this.dettagli = dettagli;
  }
}

// L'errore di Graph ridotto ai campi che servono a capirlo (come whatsapp-connect).
function erroreMeta(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  return {
    message: e.message ?? null,
    type: e.type ?? null,
    code: e.code ?? null,
    error_subcode: e.error_subcode ?? null,
    error_user_title: e.error_user_title ?? null,
    error_user_msg: e.error_user_msg ?? null,
    fbtrace_id: e.fbtrace_id ?? null,
  };
}

function registra(livello: "info" | "error", passo: string, info: Record<string, unknown>): void {
  const riga = JSON.stringify({ level: livello, fn: "whatsapp-profilo", step: passo, ...info });
  if (livello === "error") console.error(riga);
  else console.log(riga);
}

async function graph(passo: string, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const dati = await res.json().catch(() => ({}));
  if (!res.ok || dati?.error) throw new ErroreMeta(passo, erroreMeta(dati?.error));
  return dati as Record<string, unknown>;
}

async function leggiProfilo(phoneNumberId: string, token: string): Promise<ProfiloWhatsApp> {
  const dati = await graph(
    "leggi",
    `${GRAPH}/${phoneNumberId}/whatsapp_business_profile?fields=${CAMPI_META_PROFILO}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const righe = Array.isArray(dati.data) ? dati.data : [];
  return profiloDaMeta(righe[0]);
}

/** Il nome visualizzato e la sua revisione: si mostra, non si cambia da qui. */
async function leggiNome(phoneNumberId: string, token: string): Promise<{ verificato: string | null; stato: string | null } | null> {
  try {
    const dati = await graph(
      "nome",
      `${GRAPH}/${phoneNumberId}?fields=verified_name,name_status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return {
      verificato: typeof dati.verified_name === "string" ? dati.verified_name : null,
      stato: typeof dati.name_status === "string" ? dati.name_status : null,
    };
  } catch {
    return null;
  }
}

/** base64 (anche «data:image/jpeg;base64,…») → byte. */
function daBase64(valore: string): Uint8Array {
  const pulito = valore.includes(",") ? valore.slice(valore.indexOf(",") + 1) : valore;
  const binario = atob(pulito);
  const byte = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i);
  return byte;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const headers = { ...secureHeaders, ...cors };
  const risposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return risposta({ error: "Metodo non ammesso" }, 405);

  let companyId: string | null = null;
  let waNumberId: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return risposta({ error: "Accesso richiesto" }, 401);

    const utente = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await utente.auth.getUser(authHeader.slice("Bearer ".length));
    if (!user) return risposta({ error: "Accesso richiesto" }, 401);

    const body = await req.json().catch(() => ({}));
    companyId = typeof body.company_id === "string" ? body.company_id : null;
    waNumberId = typeof body.wa_number_id === "string" ? body.wa_number_id : null;
    const azione = body.azione;
    if (!companyId || !waNumberId) return risposta({ error: "Servono company_id e wa_number_id" }, 400);
    if (!["leggi", "salva", "foto"].includes(azione)) return risposta({ error: "Azione sconosciuta" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await assertMetaCompanyAdminAccess(admin, user.id, companyId);

    const { data: numero } = await admin
      .from("ai_whatsapp_numbers")
      .select("id, phone_number_id, access_token_encrypted")
      .eq("id", waNumberId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!numero?.phone_number_id || !numero?.access_token_encrypted) {
      return risposta({ error: "Numero WhatsApp non trovato o non collegato" }, 404);
    }
    const phoneNumberId = String(numero.phone_number_id);
    const token = await decryptMaybeEncrypted(numero.access_token_encrypted, getEncryptionKey());
    const traccia = { company_id: companyId, wa_number_id: waNumberId, phone_number_id: phoneNumberId };

    if (azione === "leggi") {
      const [profilo, nome] = await Promise.all([leggiProfilo(phoneNumberId, token), leggiNome(phoneNumberId, token)]);
      return risposta({ profilo, nome });
    }

    if (azione === "salva") {
      const precedente = await leggiProfilo(phoneNumberId, token);
      const nuovo = normalizzaProfilo(body.profilo ?? {});
      const errori = erroriProfilo(nuovo, precedente);
      if (Object.keys(errori).length > 0) {
        return risposta({ error: "Controlla i campi evidenziati", errori }, 400);
      }
      const corpo = corpoPerMeta(nuovo, precedente);
      if (!corpo) return risposta({ profilo: precedente, invariato: true });

      await graph("salva", `${GRAPH}/${phoneNumberId}/whatsapp_business_profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      registra("info", "salva", { ...traccia, campi: Object.keys(corpo).filter((k) => k !== "messaging_product") });
      return risposta({ profilo: await leggiProfilo(phoneNumberId, token) });
    }

    // azione === "foto"
    const foto = body.foto ?? {};
    const tipo = typeof foto.tipo === "string" ? foto.tipo : "";
    if (!(FOTO_PROFILO.tipiAmmessi as readonly string[]).includes(tipo) || typeof foto.base64 !== "string") {
      return risposta({ error: "Serve una foto JPG o PNG" }, 400);
    }
    const byte = daBase64(foto.base64);
    if (byte.length === 0 || byte.length > FOTO_PROFILO.maxByte) {
      return risposta({ error: "La foto deve pesare meno di 5 MB" }, 400);
    }
    const { metaAppId } = await getMetaCredentials();
    if (!metaAppId) return risposta({ error: "Configurazione Meta incompleta: manca l'ID dell'app" }, 500);

    // 1. Sessione di caricamento sull'app, 2. il file, 3. l'handle sul profilo.
    const sessione = await graph(
      "foto_sessione",
      `${GRAPH}/${metaAppId}/uploads?${new URLSearchParams({
        file_name: tipo === "image/png" ? "profilo-whatsapp.png" : "profilo-whatsapp.jpg",
        file_length: String(byte.length),
        file_type: tipo,
      })}`,
      { method: "POST", headers: { Authorization: `OAuth ${token}` } },
    );
    const idSessione = typeof sessione.id === "string" ? sessione.id : "";
    if (!idSessione) throw new ErroreMeta("foto_sessione", { message: "sessione di caricamento senza id" });

    const caricato = await graph("foto_file", `${GRAPH}/${idSessione}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
      body: byte,
    });
    const handle = typeof caricato.h === "string" ? caricato.h : "";
    if (!handle) throw new ErroreMeta("foto_file", { message: "caricamento senza handle" });

    await graph("foto_profilo", `${GRAPH}/${phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle }),
    });
    registra("info", "foto", { ...traccia, byte: byte.length, tipo });
    return risposta({ profilo: await leggiProfilo(phoneNumberId, token) });
  } catch (err) {
    if (err instanceof ErroreMeta) {
      registra("error", err.passo, { company_id: companyId, wa_number_id: waNumberId, meta: err.dettagli });
      return risposta({ error: err.message, passo: err.passo }, 502);
    }
    registra("error", "errore", { company_id: companyId, wa_number_id: waNumberId, error: getErrorMessage(err) });
    return risposta({ error: getErrorMessage(err) }, getErrorStatus(err));
  }
});
