import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, mkdir, rm, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
const exec = promisify(execFile);
const MAX_BYTES = 12 * 1024 * 1024;
export function planFileExtension(bytes: Uint8Array): "png" | "jpg" | "pdf" {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-") return "pdf";
  throw new Error("Formato non supportato: usa PNG, JPEG o PDF.");
}
export function localPlanRequestAllowed(req: Pick<IncomingMessage, "headers" | "socket">): boolean {
  const remote = req.socket.remoteAddress;
  if (!remote || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    return ["127.0.0.1", "localhost", "[::1]"].includes(host.hostname)
      && req.headers.origin === host.origin
      && (!req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin");
  } catch { return false; }
}
async function body(req: IncomingMessage): Promise<Buffer> {
  if (Number(req.headers["content-length"] ?? 0) > MAX_BYTES) throw new Error("File oltre 12 MB.");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > MAX_BYTES) throw new Error("File oltre 12 MB.");
    chunks.push(bytes);
  }
  if (!size) throw new Error("File vuoto.");
  return Buffer.concat(chunks);
}
export function localPlanOcrPlugin(): Plugin {
  let compiling: Promise<string> | null = null; let active = false;
  const compile = () => compiling ??= (async () => {
    const source = fileURLToPath(new URL("./PlanOcr.swift", import.meta.url));
    const cache = fileURLToPath(new URL("../../node_modules/.cache/quote-plan-ocr/", import.meta.url));
    const hash = createHash("sha256").update(await readFile(source)).digest("hex").slice(0, 16);
    await mkdir(cache, { recursive: true }); const binary = join(cache, `plan-ocr-${hash}`);
    try { await access(binary); } catch { await exec("xcrun", ["swiftc", source, "-O", "-o", binary], { timeout: 90_000, maxBuffer: 200_000 }); }
    return binary;
  })().catch(error => { compiling = null; throw error; });
  return { name: "local-private-plan-ocr", apply: "serve", configureServer(server) {
    server.middlewares.use("/__quote-lab/ocr", async (req, res) => {
      const reply = (status: number, value: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(value)); };
      if (!localPlanRequestAllowed(req)) { reply(403, { error: "Lettura riservata alla pagina locale." }); return; }
      if (req.method !== "POST") { reply(405, { error: "Usa POST." }); return; }
      if (process.platform !== "darwin") { reply(503, { error: "OCR locale Apple Vision disponibile solo su macOS. Nessun servizio esterno utilizzato." }); return; }
      if (active) { reply(429, { error: "È già in corso una lettura locale. Attendi o interrompila." }); return; }
      if (req.headers["content-type"] !== "application/octet-stream") { reply(415, { error: "Formato richiesta non supportato." }); return; }
      const page = Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("page") ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 20) { reply(400, { error: "Pagina non valida (1–20)." }); return; }
      active = true; let taskDir: string | null = null;
      const abort = new AbortController(); const closed = () => { if (!res.writableEnded) abort.abort(); }; res.on("close", closed);
      try {
        const bytes = await body(req); const ext = planFileExtension(bytes);
        const binary = await compile(); if (abort.signal.aborted) return;
        taskDir = await mkdtemp(join(tmpdir(), "eic-plan-ocr-")); const file = join(taskDir, `input.${ext}`);
        await writeFile(file, bytes, { mode: 0o600 });
        const { stdout } = await exec(binary, [file, String(page)], { timeout: 35_000, maxBuffer: 500_000, signal: abort.signal });
        if (!abort.signal.aborted) reply(200, JSON.parse(stdout));
      } catch (e) {
        if (!abort.signal.aborted) reply(422, { error: e instanceof Error && /^(Formato|File)/.test(e.message) ? e.message : "Non riesco a leggere il documento. Verifica che sia un’immagine leggibile o un PDF non protetto (massimo 20 pagine)." });
      } finally {
        res.off("close", closed);
        // Only the exact task directory returned by mkdtemp is removed, never a user file.
        if (taskDir) await rm(taskDir, { recursive: true, force: true });
        active = false;
      }
    });
  } };
}
