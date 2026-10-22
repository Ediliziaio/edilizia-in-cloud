/**
 * Firma elettronica avanzata: l'azienda identifica chi firma (DPCM 22/02/2013
 * art. 57 c.1 a). Chi ha visto di persona il documento d'identità (in ufficio,
 * in cantiere) ne carica le foto e i dati dal gestionale; al primo documento il
 * firmatario dovrà solo accettare le condizioni del servizio, dopo il codice.
 * La dichiarazione resta sempre e solo sua.
 *
 * Azioni (multipart/form-data, campo `azione`):
 *  - `identifica`: company_id, email, nome, cognome, codice_fiscale?,
 *    documento_tipo, documento_numero, documento_rilasciato_da?,
 *    documento_scadenza, visto="true", fronte, retro (non per il passaporto).
 *  - `revoca`: company_id, firmatario_id (art. 57 c.1 h: su richiesta di chi firma).
 *  - `vedi`: company_id, firmatario_id → link di un minuto alle foto.
 *
 * Solo titolare e ufficio (company_admin, company_staff) dell'azienda.
 */
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { TIPI_DOCUMENTO_IDENTITA } from "../_shared/firmaAvanzata.ts";

const MAX_FILE = 10 * 1024 * 1024;
const ESTENSIONI: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};
const testoCampo = (fd: FormData, k: string, max: number) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const risposta = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    let fd: FormData;
    try { fd = await req.formData(); } catch { return risposta(400, { error: "Dati non validi" }); }
    const companyId = testoCampo(fd, "company_id", 40);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH, { allowedRoles: ["company_admin", "company_staff"] });
    const azione = testoCampo(fd, "azione", 20);

    // ── Revoca e consultazione ────────────────────────────────────────────
    if (azione === "revoca" || azione === "vedi") {
      const firmatarioId = testoCampo(fd, "firmatario_id", 40);
      const { data: f } = await supabaseAdmin.from("fea_firmatari")
        .select("id, documento_fronte_path, documento_retro_path, revocato_at")
        .eq("id", firmatarioId).eq("company_id", companyId).maybeSingle();
      if (!f) return risposta(404, { error: "Firmatario non trovato" });
      if (azione === "revoca") {
        // Chi e quando restano sulla riga (il registro di audit è per richiesta di firma).
        if (!f.revocato_at) await supabaseAdmin.from("fea_firmatari").update({ revocato_at: new Date().toISOString(), revocato_da: userId }).eq("id", f.id);
        return risposta(200, { success: true });
      }
      const link = async (path: string | null) => {
        if (!path) return null;
        const { data } = await supabaseAdmin.storage.from("fea-identita").createSignedUrl(path, 60);
        return data?.signedUrl ?? null;
      };
      return risposta(200, { fronte: await link(f.documento_fronte_path), retro: await link(f.documento_retro_path) });
    }
    if (azione !== "identifica") return risposta(400, { error: "Azione non valida" });

    // ── Identificazione ───────────────────────────────────────────────────
    const email = testoCampo(fd, "email", 200).toLowerCase();
    const nome = testoCampo(fd, "nome", 80);
    const cognome = testoCampo(fd, "cognome", 80);
    const codiceFiscale = testoCampo(fd, "codice_fiscale", 16).toUpperCase();
    const documentoTipo = testoCampo(fd, "documento_tipo", 20);
    const documentoNumero = testoCampo(fd, "documento_numero", 30).toUpperCase();
    const rilasciatoDa = testoCampo(fd, "documento_rilasciato_da", 120);
    const scadenza = testoCampo(fd, "documento_scadenza", 10);
    const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return risposta(400, { error: "Scrivi l'email di chi firma: è quella a cui arrivano i documenti." });
    if (!nome || !cognome) return risposta(400, { error: "Scrivi nome e cognome come sul documento." });
    if (codiceFiscale && !/^[A-Z0-9]{16}$/.test(codiceFiscale)) return risposta(400, { error: "Il codice fiscale ha 16 caratteri, tra lettere e numeri." });
    if (!TIPI_DOCUMENTO_IDENTITA[documentoTipo]) return risposta(400, { error: "Scegli il tipo di documento." });
    if (!/^[A-Z0-9 ]{4,30}$/.test(documentoNumero)) return risposta(400, { error: "Scrivi il numero del documento." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scadenza) || !Number.isFinite(Date.parse(scadenza))) return risposta(400, { error: "Scrivi la data di scadenza del documento." });
    if (scadenza < oggi) return risposta(400, { error: "Il documento è scaduto: serve un documento valido." });
    if (fd.get("visto") !== "true") return risposta(400, { error: "Conferma di aver visto il documento originale e la persona." });

    const fronte = fd.get("fronte");
    const retro = fd.get("retro");
    const fileValido = (f: FormDataEntryValue | null): f is File => f instanceof File && f.size > 0;
    if (!fileValido(fronte)) return risposta(400, { error: "Carica la foto del documento (fronte)." });
    if (documentoTipo !== "passaporto" && !fileValido(retro)) return risposta(400, { error: "Carica anche il retro del documento." });
    for (const f of [fronte, retro]) {
      if (!fileValido(f)) continue;
      if (!ESTENSIONI[f.type]) return risposta(400, { error: "Carica una foto (JPG, PNG, HEIC) o un PDF del documento." });
      if (f.size > MAX_FILE) return risposta(400, { error: "Il file del documento supera 10 MB." });
    }

    const firmatarioId = crypto.randomUUID();
    const cartella = `${companyId}/${firmatarioId}`;
    const carica = async (f: File, nomeFile: string) => {
      const path = `${cartella}/${nomeFile}.${ESTENSIONI[f.type]}`;
      const { error } = await supabaseAdmin.storage.from("fea-identita").upload(path, f, { contentType: f.type, upsert: false });
      if (error) throw new Error(`Documento non salvato: ${error.message}`);
      return path;
    };
    const frontePath = await carica(fronte, "fronte");
    const retroPath = fileValido(retro) ? await carica(retro, "retro") : null;

    // Una sola identificazione attiva per azienda ed email: la nuova sostituisce la vecchia.
    const ora = new Date().toISOString();
    await supabaseAdmin.from("fea_firmatari").update({ revocato_at: ora, revocato_da: userId })
      .eq("company_id", companyId).ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).is("revocato_at", null);
    const { error: insErr } = await supabaseAdmin.from("fea_firmatari").insert({
      id: firmatarioId,
      company_id: companyId,
      email,
      nome, cognome,
      codice_fiscale: codiceFiscale || null,
      documento_tipo: documentoTipo,
      documento_numero: documentoNumero,
      documento_rilasciato_da: rilasciatoDa || null,
      documento_scadenza: scadenza,
      documento_fronte_path: frontePath,
      documento_retro_path: retroPath,
      modalita: "azienda",
      identificato_da: userId,
      identificato_ip: (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      identificato_user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    if (insErr) {
      await supabaseAdmin.storage.from("fea-identita").remove([frontePath, ...(retroPath ? [retroPath] : [])]);
      console.error("fea-firmatario-azienda insert:", insErr);
      return risposta(500, { error: "Identificazione non salvata. Riprova tra qualche istante." });
    }
    return risposta(200, { success: true, firmatario_id: firmatarioId });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("fea-firmatario-azienda error:", err);
    return new Response(JSON.stringify({ error: "Errore interno del server" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
