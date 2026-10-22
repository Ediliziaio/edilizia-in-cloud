/**
 * Le prove di una firma, conservate 20 anni (DPCM 22/02/2013 art. 57 c.1 b).
 *
 * A firma completata e PDF firmato pronto, si mette insieme il pacchetto:
 * dati della richiesta (senza codici né chiavi), tutti gli eventi del registro
 * con la loro catena di impronte, il firmatario identificato con la sua
 * dichiarazione, le impronte del documento congelato e del PDF firmato. Il
 * pacchetto va in `fea_prove_conservate` (righe non modificabili, senza legami
 * con l'azienda: sopravvivono alla sua cancellazione) e i file in
 * `fea-conservazione/<azienda>/<richiesta>/`.
 *
 * Idempotente: se il pacchetto c'è già non fa niente.
 */
import { sha256Hex } from "./documentoCongelato.ts";

const COLONNE_RICHIESTA = "id, company_id, tipo_documento, tipo_firmatario, categoria, livello_firma, signer_name, signer_email, signer_phone, status, created_at, created_by, expires_at, signed_at, otp_canale, otp_invii, otp_errori_totali, documento_path, documento_hash, documento_hash_firma, firma_ip, firma_user_agent, firma_lat, firma_lng, clausole_approvate, clausole_approvate_testi, clausole_approvate_ts, b2c_recesso, b2c_recesso_ts, firmatario_id, signed_pdf_path, signed_pdf_hash, codice_verifica, quote_id, order_id, sessione_id, fv_progetto_id, contratto_subappalto_id";

// deno-lint-ignore no-explicit-any
async function copia(sb: any, bucket: string, da: string, a: string): Promise<string | null> {
  const { data: file } = await sb.storage.from(bucket).download(da);
  if (!file) return null;
  const { error } = await sb.storage.from("fea-conservazione").upload(a, file, { contentType: file.type || "application/octet-stream", upsert: true });
  return error ? null : a;
}

// deno-lint-ignore no-explicit-any
export async function conservaProveFirma(sb: any, richiestaId: string): Promise<boolean> {
  const { data: esiste } = await sb.from("fea_prove_conservate").select("id").eq("richiesta_id", richiestaId).maybeSingle();
  if (esiste) return false;

  const { data: r } = await sb.from("signature_requests").select(COLONNE_RICHIESTA).eq("id", richiestaId).maybeSingle();
  if (!r || r.status !== "signed" || !r.signed_pdf_path) return false;

  const base = `${r.company_id}/${r.id}`;
  const [{ data: azienda }, { data: eventi }, { data: firmatario }] = await Promise.all([
    sb.from("companies").select("name, vat_number").eq("id", r.company_id).maybeSingle(),
    sb.from("fea_audit_log").select("evento, created_at, ip, user_agent, lat, lng, metadati, hash_precedente, hash_riga")
      .eq("request_id", r.id).order("created_at", { ascending: true }),
    r.firmatario_id
      ? sb.from("fea_firmatari").select("*").eq("id", r.firmatario_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // I file: PDF firmato, documento congelato, immagini del documento d'identità.
  const file: Record<string, string | null> = {
    pdf_firmato: await copia(sb, "quote-pdfs", r.signed_pdf_path, `${base}/documento-firmato.pdf`),
    documento_inviato: r.documento_path
      ? await copia(sb, "quote-pdfs", r.documento_path, `${base}/documento-inviato.${r.documento_path.endsWith(".html") ? "html" : "pdf"}`)
      : null,
  };
  if (firmatario?.documento_fronte_path) {
    file.identita_fronte = await copia(sb, "fea-identita", firmatario.documento_fronte_path, `${base}/identita-fronte`);
  }
  if (firmatario?.documento_retro_path) {
    file.identita_retro = await copia(sb, "fea-identita", firmatario.documento_retro_path, `${base}/identita-retro`);
  }

  const pacchetto = {
    versione: 1,
    creato_il: new Date().toISOString(),
    azienda: { id: r.company_id, nome: azienda?.name ?? null, partita_iva: azienda?.vat_number ?? null },
    richiesta: r,
    firmatario: firmatario ?? null,
    eventi: eventi ?? [],
    file,
  };
  const testo = JSON.stringify(pacchetto);
  const { error } = await sb.from("fea_prove_conservate").insert({
    richiesta_id: r.id,
    company_id: r.company_id,
    azienda_nome: azienda?.name ?? null,
    pacchetto,
    pacchetto_hash: await sha256Hex(new TextEncoder().encode(testo)),
    pdf_firmato_path: file.pdf_firmato,
    pdf_firmato_hash: r.signed_pdf_hash ?? null,
  });
  if (error) {
    if (String(error.code) === "23505") return false; // un'altra chiamata l'ha già conservato
    throw new Error(`Prove della firma non conservate: ${error.message}`);
  }
  await sb.from("fea_audit_log").insert({
    request_id: r.id, company_id: r.company_id, evento: "prove_conservate",
    metadati: { file: Object.values(file).filter(Boolean).length },
  });
  return true;
}
