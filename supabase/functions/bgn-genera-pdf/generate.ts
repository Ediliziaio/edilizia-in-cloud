import { BATHROOM_RENDERER_VERSION, UUID, bathroomStateDigest, documentDigest, readBathroomDocumentState,
  requireBathroomDocumentAccess, validateBathroomArtifact, verifyBathroomArtifactBytes } from "../_shared/bathroomDocumentState.ts";
import { signBathroomProjectMedia } from "../_shared/scopedProjectMedia.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any -- schema-independent database adapter; runtime validation is mandatory
type Any = any;
export async function generateBathroomModelPdf(db: Any, userId: string, body: Any, render: (input: Any) => Promise<Uint8Array>) {
  if (!UUID.test(String(body?.company_id ?? "")) || !UUID.test(String(body?.progetto_id ?? "")) ||
      typeof body.modello !== "string" || typeof body.revisione_progetto !== "string") {
    throw new Error("Indica azienda, progetto bagno, modello e revisione esatti. Una quote classica non basta.");
  }
  const companyId = body.company_id; const projectId = body.progetto_id;
  await requireBathroomDocumentAccess(db, companyId, userId);
  const readPayload = () => readBathroomDocumentState(db, companyId, projectId, body.modello, body.revisione_progetto);
  const payload = await readPayload(); const fingerprint = await bathroomStateDigest(payload);
  const { data: existing, error: lookupError } = await db.from("whatsapp_quote_artifacts").select("*")
    .eq("company_id", companyId).eq("module", "bagni").eq("project_id", projectId).eq("fingerprint", fingerprint).maybeSingle();
  if (lookupError) throw new Error("Archivio ricevute PDF non disponibile. Nessun documento rigenerato.");
  async function receipt(artifact: unknown, reused: boolean) {
    validateBathroomArtifact(artifact, companyId, projectId, body.modello, body.revisione_progetto, fingerprint);
    await verifyBathroomArtifactBytes(db, artifact);
    if (await bathroomStateDigest(await readPayload()) !== fingerprint) throw new Error("Il progetto è cambiato durante la generazione. Documento non pubblicato.");
    await requireBathroomDocumentAccess(db, companyId, userId);
    const { data: signed, error } = await db.storage.from("quote-pdfs").createSignedUrl(artifact.storage_path, 3600);
    if (error || !signed?.signedUrl) throw new Error("PDF salvato ma link non disponibile. Nessun invio effettuato.");
    return { success: true, artifact_id: artifact.id, progetto_id: projectId, company_id: companyId, model_id: body.modello,
      project_revision: body.revisione_progetto, fingerprint, pdf_sha256: artifact.pdf_sha256, pdf_storage_path: artifact.storage_path,
      signed_url: signed.signedUrl, renderer: "DocumentoEdilePDF", renderer_version: BATHROOM_RENDERER_VERSION,
      pdf_generated: true, message_sent: false, reused, visual_review_required: true, image_transforms: "server-basic-jpg-png" };
  }
  if (existing) return await receipt(existing, true);
  // Hash the saved references, not expiring URLs. The signed copy only goes to
  // the DB-free renderer; nothing is persisted back into the customer's project.
  const media = await signBathroomProjectMedia(db, companyId, projectId, payload.media, Deno.env.get("SUPABASE_URL") ?? "");
  const bytes = await render({ ...payload, media }); // Any render/image failure stops. No fallback.
  if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > 20 * 1024 * 1024 ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il renderer non ha prodotto un PDF valido entro i limiti.");
  if (await bathroomStateDigest(await readPayload()) !== fingerprint) throw new Error("Il progetto è cambiato durante la generazione. Documento non pubblicato.");
  await requireBathroomDocumentAccess(db, companyId, userId);
  const sha256 = await documentDigest(bytes);
  const path = `bagno/${companyId}/${projectId}/${fingerprint}-${sha256}.pdf`;
  const { error: uploadError } = await db.storage.from("quote-pdfs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    // Another generator may have uploaded identical bytes. Never overwrite or
    // trust an error code alone: download and compare the actual stored content.
    try { await verifyBathroomArtifactBytes(db, { storage_path: path, byte_length: bytes.length, pdf_sha256: sha256 }); }
    catch { throw new Error("Salvataggio PDF non confermato. Nessun invio effettuato."); }
  }
  if (await bathroomStateDigest(await readPayload()) !== fingerprint) throw new Error("Il progetto è cambiato durante la generazione. Documento non pubblicato.");
  await requireBathroomDocumentAccess(db, companyId, userId);
  const { data: artifact, error: receiptError } = await db.rpc("whatsapp_record_bathroom_artifact", {
    p_company: companyId, p_user: userId, p_project: projectId, p_model: body.modello, p_revision: body.revisione_progetto,
    p_fingerprint: fingerprint, p_sha256: sha256, p_path: path, p_bytes: bytes.length,
  });
  if (receiptError || !artifact) throw new Error("Documento salvato ma ricevuta non confermata. Verifica nell’app; nessun invio effettuato.");
  return await receipt(artifact, artifact.pdf_sha256 !== sha256);
}
