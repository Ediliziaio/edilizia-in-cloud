import { z } from 'zod';
import { createHash } from 'node:crypto';
import { execFile } from '../gare-ai/runtime.mjs';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
function fail(message, status) { const error = Error(message); error.status = status; throw error; }

// Tenant-visible, immutable preview only: no compilation, storage write or approval.
export async function previewTemplate(ctx, body) {
  const input = z.object({ document_id: z.string().uuid(), page: z.number().int().min(1).max(500).default(1) }).strict().parse(body);
  const { data: doc, error } = await ctx.client.from('gare_documents').select('*').eq('id', input.document_id).eq('company_id', ctx.companyId).maybeSingle();
  if (error || !doc) fail('Documento non disponibile per questa azienda.', 404);
  if (!doc.template_contract_id || !doc.preview_path || !doc.preview_sha256) fail('Anteprima del modello non disponibile. Apri il file originale.', 400);
  const { data: blob, error: downloadError } = await ctx.client.storage.from('gare-private').download(doc.preview_path);
  if (downloadError) throw Error(downloadError.message);
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (createHash('sha256').update(buffer).digest('hex') !== doc.preview_sha256) fail('Hash dell’anteprima diverso dal file conservato.', 409);
  const dir = await mkdtemp(path.join(tmpdir(), 'gare-model-preview-'));
  try {
    const source = path.join(dir, 'preview.pdf'); await writeFile(source, buffer);
    const { stdout } = await exec('pdfinfo', [source], { timeout: 10_000, maxBuffer: 100_000 });
    const pageCount = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!pageCount) fail('Numero di pagine del PDF non disponibile.', 400);
    if (input.page > pageCount) fail('La pagina richiesta non esiste nel modello.', 400);
    await exec('pdftoppm', ['-f', String(input.page), '-l', String(input.page), '-singlefile', '-scale-to', '1400', '-png', source, path.join(dir, 'page')], { timeout: 20_000, maxBuffer: 100_000 });
    const image = await readFile(path.join(dir, 'page.png'));
    return { document_id: doc.id, page: input.page, page_count: pageCount, image_base64: image.toString('base64'), preview: true };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
