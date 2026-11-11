import { aiRouterComplete } from "../_shared/aiRouter.ts";
import {
  DDT_EXTRACTION_PROMPT,
  normalizeDdtPayload,
} from "../_shared/estrazioneDdt.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { parteFileDdt } from "../_shared/lettoreDdt.ts";
import { tipoFileDdt } from "../_shared/tipoFileDdt.ts";
export interface DocumentoFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  prepared_path?: string;
  prepared_mime?: string;
  prepared_name?: string;
  bucket?: string;
}
export interface DocumentoJob {
  id: string;
  company_id: string;
  created_by: string | null;
  source: string;
  files: DocumentoFile[];
  file_hash: string;
  lease_id: string;
  attempts: number;
}
const impronta = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function processaDocumento(
  db: any,
  id?: string,
): Promise<{ id?: string; stato: string }> {
  const { data: jobs, error: claimError } = await db.rpc(
    "ddt_documento_prendi",
    { p_id: id ?? null },
  );
  if (claimError) throw claimError;
  const j: DocumentoJob | undefined = jobs?.[0];
  if (!j) return { stato: "nessun_lavoro" };
  try {
    if (!Array.isArray(j.files) || !j.files.length || j.files.length > 12)
      throw new Error("File del documento non validi");
    const contenuti: any[] = [];
    const hashes: string[] = [];
    let totale = 0;
    let totalePreparato = 0;
    for (const f of j.files) {
      const bucket = f.bucket ?? "ddt-documenti";
      if (
        !["ddt-documenti", "whatsapp-media"].includes(bucket) ||
        !percorsoStorageSicuro(f.path) ||
        !f.path.startsWith(`${j.company_id}/`)
      )
        throw new Error("Percorso non autorizzato");
      if (
        bucket === "ddt-documenti" &&
        !f.path.startsWith(`${j.company_id}/${j.created_by}/${j.id}/`)
      )
        throw new Error("Documento fuori dalla propria cartella");
      const originale = await db.storage.from(bucket).download(f.path);
      if (originale.error || !originale.data)
        throw new Error("Originale non disponibile");
      const originalBytes = new Uint8Array(await originale.data.arrayBuffer());
      const mimeOriginale = tipoFileDdt(originalBytes);
      if (!mimeOriginale)
        throw new Error("Il file non è una foto o un PDF valido");
      totale += originalBytes.byteLength;
      if (totale > 18 * 1024 * 1024)
        throw new Error("Documento oltre 18 MB: dividi il file");
      hashes.push(await impronta(originalBytes));
      let bytes = originalBytes;
      let mime = mimeOriginale;
      let nome = f.name;
      if (f.prepared_path && f.prepared_path !== f.path) {
        if (
          !percorsoStorageSicuro(f.prepared_path) ||
          f.prepared_path.slice(0, f.prepared_path.lastIndexOf("/")) !==
            f.path.slice(0, f.path.lastIndexOf("/"))
        )
          throw new Error("Conversione fuori dalla cartella del documento");
        const preparato = await db.storage
          .from(bucket)
          .download(f.prepared_path);
        if (preparato.error || !preparato.data)
          throw new Error("Copia per la lettura non disponibile");
        bytes = new Uint8Array(await preparato.data.arrayBuffer());
        mime = f.prepared_mime ?? "image/jpeg";
        nome = f.prepared_name ?? `${f.name}.jpg`;
      } else if (/hei[cf]/i.test(mime) || /\.hei[cf]$/i.test(nome)) {
        const { heicInJpeg } = await import("../_shared/conversioneHeic.ts");
        bytes = await heicInJpeg(bytes);
        mime = "image/jpeg";
        nome = f.name.replace(/\.hei[cf]$/i, "") + ".jpg";
        const preparedPath = `${f.path}.lettura.jpg`;
        const { error: uploadError } = await db.storage
          .from(bucket)
          .upload(preparedPath, bytes, { contentType: mime, upsert: false });
        if (
          uploadError &&
          !/already exists|duplicate/i.test(uploadError.message) &&
          String(uploadError.statusCode) !== "409"
        )
          throw new Error("Salvataggio temporaneamente non disponibile");
        f.prepared_path = preparedPath;
        f.prepared_mime = mime;
        f.prepared_name = nome;
      }
      const effettivo = tipoFileDdt(bytes);
      if (!effettivo || effettivo !== mime)
        throw new Error("Il formato dichiarato non corrisponde al documento");
      totalePreparato += bytes.byteLength;
      if (
        bytes.byteLength > 18 * 1024 * 1024 ||
        totalePreparato > 24 * 1024 * 1024 ||
        ![
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/bmp",
        ].includes(mime)
      )
        throw new Error("Formato non leggibile");
      contenuti.push(
        {
          type: "text",
          text: `Pagina/allegato ${contenuti.length / 2 + 1}: ${nome}`,
        },
        parteFileDdt({ base64: bytesToBase64(bytes), mime, fileName: nome }),
      );
    }
    if (
      (await impronta(new TextEncoder().encode(hashes.join(":")))) !==
      j.file_hash
    )
      throw new Error("L’originale non corrisponde al documento acquisito");
    const ai = await aiRouterComplete({
      supabase: db,
      taskKey: "pdf_vision_extract",
      companyId: j.company_id,
      userId: j.created_by ?? undefined,
      idempotencyKey: `ddt_persistente_${j.company_id}_${j.file_hash}`,
      messages: [
        { role: "system", content: conRegoleDocumento(DDT_EXTRACTION_PROMPT) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Queste pagine appartengono allo stesso documento. Leggi tutte le righe una sola volta, conservando annotazioni e riferimenti.",
            },
            ...contenuti,
          ],
        },
      ],
      params: { temperature: 0, max_tokens: 10000 },
      responseFormat: { type: "json_object" },
    });
    const parsed = leggiJsonDalModello(ai.content);
    if (!parsed) throw new Error("Lettura non riuscita: risposta incompleta");
    const risultato = normalizeDdtPayload(parsed);
    const { data: updated, error } = await db
      .from("ddt_document_jobs")
      .update({
        status: "review",
        files: j.files,
        result: risultato,
        last_error: null,
        lease_id: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", j.id)
      .eq("lease_id", j.lease_id)
      .eq("status", "processing")
      .select("id");
    if (error) throw error;
    return { id: j.id, stato: updated?.length ? "review" : "lease_scaduta" };
  } catch (e) {
    const recuperabile = /timeout|429|tempor|502|503|504|fetch|network/i.test(
      String((e as Error)?.message ?? e),
    );
    const riprova = recuperabile && j.attempts < 5;
    const { error } = await db
      .from("ddt_document_jobs")
      .update({
        status: riprova ? "queued" : "error",
        last_error:
          "Lettura non riuscita. L’originale è conservato: puoi riprovare o farlo verificare all’ufficio.",
        lease_id: null,
        lease_until: null,
        retry_at: new Date(
          Date.now() + Math.min(300, 15 * 2 ** j.attempts) * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", j.id)
      .eq("lease_id", j.lease_id)
      .eq("status", "processing");
    if (error) throw error;
    console.error(
      JSON.stringify({
        fn: "ddt-documenti-processa",
        job: j.id,
        error: e instanceof Error ? e.name : "lettura",
      }),
    );
    return { id: j.id, stato: riprova ? "queued" : "error" };
  }
}
