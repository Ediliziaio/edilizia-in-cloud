/**
 * Identificazione del firmatario per la firma elettronica avanzata (DPCM
 * 22/02/2013 art. 57 c.1 a): al primo documento con un'azienda chi firma carica
 * il documento di riconoscimento, scrive i suoi dati e accetta la dichiarazione
 * sulle condizioni del servizio. Si può fare solo dopo il codice giusto (serve
 * la chiave di sessione), quindi da chi controlla l'email o il cellulare a cui
 * è arrivato il codice.
 *
 * Le immagini vanno nel bucket privato `fea-identita`; i dati in
 * `fea_firmatari` (conservati 20 anni). Una copia della dichiarazione va per
 * email a chi firma (art. 57 c.1 c).
 *
 * Se l'azienda ha già identificato il firmatario (fea-firmatario-azienda), qui
 * resta solo da accettare la dichiarazione: bastano accetto e versione.
 *
 * Corpo: multipart/form-data con token, sessione_firma, nome, cognome,
 * codice_fiscale?, documento_tipo, documento_numero, documento_rilasciato_da?,
 * documento_scadenza (AAAA-MM-GG), dichiarazione_versione, accetto="true",
 * fronte (file), retro (file, obbligatorio per carta d'identità e patente).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { erroreStatoFirma, variantiTokenFirma } from "../_shared/statoFirma.ts";
import {
  DICHIARAZIONE_VERSIONE, TIPI_DOCUMENTO_IDENTITA, controllaSessioneFirma, impronta, ipDellaRichiesta, statoIdentificazione, testoDichiarazione,
} from "../_shared/firmaAvanzata.ts";

const MAX_FILE = 10 * 1024 * 1024;
const ESTENSIONI: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const testoCampo = (fd: FormData, k: string, max: number) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const errore = (status: number, message: string, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ error: message, ...extra }), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  try {
    let fd: FormData;
    try { fd = await req.formData(); } catch { return errore(400, "Dati non validi"); }

    const varianti = variantiTokenFirma(fd.get("token"));
    if (!varianti.length) return errore(400, "Link di firma non valido");

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: r } = await supabaseAdmin.from("signature_requests")
      .select("id, company_id, status, expires_at, signer_email, signer_name, livello_firma, sessione_firma_hash, sessione_firma_scadenza")
      .in("token", varianti).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!r) return errore(404, "Link di firma non trovato");
    const stato = erroreStatoFirma(r);
    if (stato) return errore(stato.status, stato.error);
    if (r.status !== "otp_verified" || !(await controllaSessioneFirma(r, fd.get("sessione_firma")))) {
      return errore(401, "Il tempo per firmare è scaduto: richiedi un nuovo codice.", { code: "sessione_scaduta" });
    }

    if (fd.get("accetto") !== "true") return errore(400, "Per proseguire accetta le condizioni del servizio di firma.");
    if (fd.get("dichiarazione_versione") !== DICHIARAZIONE_VERSIONE) {
      return errore(409, "Il testo delle condizioni è stato aggiornato: ricarica la pagina e rileggilo.");
    }
    const { data: azienda } = await supabaseAdmin.from("companies").select("name").eq("id", r.company_id).maybeSingle();
    const branding = await getBrandingForCompany(supabaseAdmin, r.company_id);
    const aziendaNome = azienda?.name ?? branding.platformName;
    const dichiarazione = testoDichiarazione(aziendaNome, branding.siteUrl);
    const dichiarazioneHash = await impronta(dichiarazione);
    const ip = ipDellaRichiesta(req);
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const ora = new Date().toISOString();
    const emailPulita = String(r.signer_email ?? "").trim();
    const copiaDichiarazione = async (firmatarioId: string, nome: string, cognome: string) => {
      try {
        await sendEmailUnified({
          companyId: r.company_id,
          stream: "transactional",
          to: [emailPulita],
          subject: `Copia delle condizioni di firma elettronica - ${aziendaNome}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">
  <p>Gentile ${esc(nome)} ${esc(cognome)},</p>
  <p>ecco la copia della dichiarazione che hai accettato il ${esc(new Date(ora).toLocaleString("it-IT", { timeZone: "Europe/Rome" }))} per firmare elettronicamente i documenti di ${esc(aziendaNome)}. Conservala.</p>
  <div style="white-space:pre-wrap;font-size:13px;line-height:1.5;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px">${esc(dichiarazione)}</div>
  <p style="color:#64748B;font-size:12px">Versione ${esc(DICHIARAZIONE_VERSIONE)} · impronta ${esc(dichiarazioneHash)}</p>
</div>`,
          templateName: "fea_dichiarazione",
          skipCredits: true,
          adminClient: supabaseAdmin,
          metadata: { request_id: r.id, firmatario_id: firmatarioId },
        });
      } catch (e) {
        console.error("Copia della dichiarazione non inviata:", e);
      }
    };
    const datiDichiarazione = {
      dichiarazione_versione: DICHIARAZIONE_VERSIONE,
      dichiarazione_hash: dichiarazioneHash,
      dichiarazione_accettata_at: ora,
      dichiarazione_ip: ip,
      dichiarazione_user_agent: userAgent,
      dichiarazione_richiesta_id: r.id,
    };

    // ── Già identificato (dall'azienda o prima): manca solo la dichiarazione ──
    const identita = await statoIdentificazione(supabaseAdmin, r.company_id, emailPulita);
    if (identita.firmatario) {
      const f = identita.firmatario;
      if (!f.dichiarazione_accettata_at) {
        const { data: ok, error } = await supabaseAdmin.from("fea_firmatari").update(datiDichiarazione)
          .eq("id", f.id).is("dichiarazione_accettata_at", null).select("id").maybeSingle();
        if (error) return errore(500, "Accettazione non salvata. Riprova tra qualche istante.");
        if (ok) {
          await supabaseAdmin.from("fea_audit_log").insert({
            request_id: r.id, company_id: r.company_id, evento: "dichiarazione_accettata", ip, user_agent: userAgent,
            metadati: { firmatario_id: f.id, versione: DICHIARAZIONE_VERSIONE, hash: dichiarazioneHash, identificato_da: f.modalita },
          });
          await copiaDichiarazione(f.id, f.nome, f.cognome);
        }
      }
      await supabaseAdmin.from("signature_requests").update({ firmatario_id: f.id }).eq("id", r.id);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsH, "Content-Type": "application/json" } });
    }

    // ── Dati ────────────────────────────────────────────────────────────────
    const nome = testoCampo(fd, "nome", 80);
    const cognome = testoCampo(fd, "cognome", 80);
    const codiceFiscale = testoCampo(fd, "codice_fiscale", 16).toUpperCase();
    const documentoTipo = testoCampo(fd, "documento_tipo", 20);
    const documentoNumero = testoCampo(fd, "documento_numero", 30).toUpperCase();
    const rilasciatoDa = testoCampo(fd, "documento_rilasciato_da", 120);
    const scadenza = testoCampo(fd, "documento_scadenza", 10);
    const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

    if (!nome || !cognome) return errore(400, "Scrivi nome e cognome come sul documento.");
    if (codiceFiscale && !/^[A-Z0-9]{16}$/.test(codiceFiscale)) return errore(400, "Il codice fiscale ha 16 caratteri, tra lettere e numeri.");
    if (!TIPI_DOCUMENTO_IDENTITA[documentoTipo]) return errore(400, "Scegli il tipo di documento.");
    if (!/^[A-Z0-9 ]{4,30}$/.test(documentoNumero)) return errore(400, "Scrivi il numero del documento.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scadenza) || !Number.isFinite(Date.parse(scadenza))) return errore(400, "Scrivi la data di scadenza del documento.");
    if (scadenza < oggi) return errore(400, "Il documento è scaduto: serve un documento valido.");

    // ── File ────────────────────────────────────────────────────────────────
    const fronte = fd.get("fronte");
    const retro = fd.get("retro");
    const fileValido = (f: FormDataEntryValue | null): f is File => f instanceof File && f.size > 0;
    if (!fileValido(fronte)) return errore(400, "Carica la foto del documento (fronte).");
    if (documentoTipo !== "passaporto" && !fileValido(retro)) return errore(400, "Carica anche il retro del documento.");
    for (const f of [fronte, retro]) {
      if (!fileValido(f)) continue;
      if (!ESTENSIONI[f.type]) return errore(400, "Carica una foto (JPG, PNG, HEIC) o un PDF del documento.");
      if (f.size > MAX_FILE) return errore(400, "Il file del documento supera 10 MB: scatta una foto più leggera.");
    }

    // ── Salvataggio ────────────────────────────────────────────────────────
    const firmatarioId = crypto.randomUUID();
    const cartella = `${r.company_id}/${firmatarioId}`;
    const carica = async (f: File, nomeFile: string) => {
      const path = `${cartella}/${nomeFile}.${ESTENSIONI[f.type]}`;
      const { error } = await supabaseAdmin.storage.from("fea-identita").upload(path, f, { contentType: f.type, upsert: false });
      if (error) throw new Error(`Documento non salvato: ${error.message}`);
      return path;
    };
    const frontePath = await carica(fronte, "fronte");
    const retroPath = fileValido(retro) ? await carica(retro, "retro") : null;

    // Una sola identificazione attiva per azienda ed email: la nuova sostituisce la vecchia
    // (documento scaduto, dati da correggere). La vecchia resta conservata.
    await supabaseAdmin.from("fea_firmatari").update({ revocato_at: ora })
      .eq("company_id", r.company_id).ilike("email", emailPulita.replace(/[\\%_]/g, (c) => `\\${c}`)).is("revocato_at", null);

    const { error: insErr } = await supabaseAdmin.from("fea_firmatari").insert({
      id: firmatarioId,
      company_id: r.company_id,
      email: emailPulita,
      nome, cognome,
      codice_fiscale: codiceFiscale || null,
      documento_tipo: documentoTipo,
      documento_numero: documentoNumero,
      documento_rilasciato_da: rilasciatoDa || null,
      documento_scadenza: scadenza,
      documento_fronte_path: frontePath,
      documento_retro_path: retroPath,
      ...datiDichiarazione,
      modalita: "autonoma",
      identificato_ip: ip,
      identificato_user_agent: userAgent,
      richiesta_id: r.id,
    });
    if (insErr) {
      await supabaseAdmin.storage.from("fea-identita").remove([frontePath, ...(retroPath ? [retroPath] : [])]);
      console.error("fea-identifica insert:", insErr);
      return errore(500, "Identificazione non salvata. Riprova tra qualche istante.");
    }
    await supabaseAdmin.from("signature_requests").update({ firmatario_id: firmatarioId }).eq("id", r.id);

    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: r.id, company_id: r.company_id, evento: "identita_registrata", ip, user_agent: userAgent,
      metadati: { firmatario_id: firmatarioId, documento_tipo: documentoTipo, documento_scadenza: scadenza, con_retro: !!retroPath },
    });
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: r.id, company_id: r.company_id, evento: "dichiarazione_accettata", ip, user_agent: userAgent,
      metadati: { firmatario_id: firmatarioId, versione: DICHIARAZIONE_VERSIONE, hash: dichiarazioneHash },
    });

    // Copia gratuita della dichiarazione a chi firma. Non blocca: la dichiarazione è già registrata.
    await copiaDichiarazione(firmatarioId, nome, cognome);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsH, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fea-identifica error:", err);
    return new Response(JSON.stringify({ error: "Errore interno del server" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
