/// <reference types="node" />
import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import { CAD_MAX_BYTES, cadSignature } from "../../src/lib/preventivi/quoteCad.ts";
import { localPlanRequestAllowed } from "../preventivatore-ai/planOcrPlugin.mts";
import { leggiPropostaPianiDwg, leggiQuoteDwg, rettangoloDwgValido, unitaDwgValida, validaRichiestaModelloDwg, type RichiestaModelloDwg, type RiferimentoDwg } from "../../src/lib/planimetrie/coordinateDwg.ts";

const exec = promisify(execFile);
const preparatore = fileURLToPath(new URL("./anteprimaDxf.py", import.meta.url));
const ricostruttore = fileURLToPath(new URL("./ricostruisciDxf.py", import.meta.url));
const MAX_DXF = 256 * 1024 * 1024;
const MAX_SVG = 24 * 1024 * 1024;
const MAX_PNG = 10 * 1024 * 1024;
const LATO = 4096;
const VIEWBOX = 1_000_000;

async function rasterizzaTavola(svg: string) {
  const { default: sharp } = await import("sharp");
  const options = { limitInputPixels: LATO * LATO };
  const { info } = await sharp(Buffer.from(svg), options)
    .trim({ background: "#fff", threshold: 12 })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (info.width === LATO && info.height === LATO) {
    throw new Error("Il disegno non mostra geometrie visibili nello spazio modello. Puoi esportare la tavola in PDF.");
  }
  // Distant reference points can inflate the CAD bounds without leaving any
  // visible ink. Render the actual drawing again at full resolution.
  const pad = Math.max(2, Math.max(info.width, info.height) * 0.015);
  const larghezza = info.width + pad * 2;
  const altezza = info.height + pad * 2;
  const lato = Math.max(larghezza, altezza);
  const scalaSvg = VIEWBOX / LATO;
  const coordinate = [
    -(info.trimOffsetLeft ?? 0) - pad,
    -(info.trimOffsetTop ?? 0) - pad,
    larghezza,
    altezza,
  ].map((v) => Number((v * scalaSvg).toFixed(2)));
  const svgInquadrato = svg
    .replace(`width="${LATO}" height="${LATO}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"`,
      `width="${Math.round(larghezza * LATO / lato)}" height="${Math.round(altezza * LATO / lato)}" viewBox="${coordinate.join(" ")}"`)
    // Preserve the printed stroke weights when a tiny drawing is enlarged.
    .replace(/stroke-width: (\d+);/g, (_, peso: string) => `stroke-width: ${(Number(peso) * lato / LATO).toFixed(2)};`);
  const png = await sharp(Buffer.from(svgInquadrato), options).flatten({ background: "#fff" }).png().toBuffer();
  return { png, coordinate };
}

type OpzioniProcesso = { signal: AbortSignal; cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number };

async function daDwg<T>(stream: AsyncIterable<Uint8Array>, signal: AbortSignal, lavora: (dxf: string, opts: OpzioniProcesso) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "eic-anteprima-dwg-"));
  const dwg = join(dir, "disegno.dwg");
  const dxf = join(dir, "disegno.dxf");
  try {
    const file = await open(dwg, "wx+", 0o600);
    let size = 0;
    try {
      for await (const chunk of stream) {
        signal.throwIfAborted();
        size += chunk.byteLength;
        if (size > CAD_MAX_BYTES) throw new Error("DWG oltre 64 MB.");
        await file.writeFile(chunk);
      }
      const magic = Buffer.alloc(6);
      if (size < magic.length) throw new Error("Il file DWG è vuoto o incompleto.");
      await file.read(magic, 0, magic.length, 0);
      if (!cadSignature(magic)) throw new Error("Il contenuto del file non è un DWG supportato.");
    } finally {
      await file.close();
    }

    // Native tools receive only the paths inside this request's directory.
    const env = {
      PATH: process.env.PATH,
      DYLD_LIBRARY_PATH: process.env.PLANIMETRIE_DWG_LIB,
      LANG: "C.UTF-8",
    };
    const opts = { signal, cwd: dir, env, maxBuffer: 512 * 1024 };
    await exec(process.env.PLANIMETRIE_DWG_BIN || "dwg2dxf", ["-o", dxf, dwg], { ...opts, timeout: 40_000 });
    if ((await stat(dxf)).size > MAX_DXF) throw new Error("Il disegno è troppo esteso. Esporta la singola tavola in PDF.");
    return await lavora(dxf, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function convertiTavolaDwg(stream: AsyncIterable<Uint8Array>, signal: AbortSignal) {
  return daDwg(stream, signal, async (dxf, opts) => {
    const svg = join(opts.cwd, "tavola.svg");
    const metadata = join(opts.cwd, "tavola.json");
    await exec(process.env.PLANIMETRIE_DWG_PYTHON || "python3", ["-I", preparatore, dxf, svg, metadata], { ...opts, timeout: 95_000 });
    if ((await stat(svg)).size > MAX_SVG) throw new Error("La tavola è troppo complessa. Esporta la singola pianta in PDF.");
    const { png, coordinate: [x, y, w, h] } = await rasterizzaTavola(await readFile(svg, "utf8"));
    if (png.length > MAX_PNG) throw new Error("L’anteprima supera 10 MB. Esporta la singola tavola in PDF.");
    const { trasformazione: [dx, dy, sx, sy], unita, quote, pianiProposti } = JSON.parse(await readFile(metadata, "utf8"));
    const rettangolo = [(x - dx) / sx, (y + h - dy) / sy, (x + w - dx) / sx, (y - dy) / sy];
    const proposta = leggiPropostaPianiDwg(pianiProposti);
    const riferimento: RiferimentoDwg | null = rettangoloDwgValido(rettangolo)
      ? { unita: unitaDwgValida(unita) ? unita : null, rettangolo, quote: leggiQuoteDwg(quote), ...(proposta && { pianiProposti: proposta }) }
      : null;
    signal.throwIfAborted();
    return { png, riferimento };
  });
}

export function ricostruisciDwg(stream: AsyncIterable<Uint8Array>, richiesta: RichiestaModelloDwg, signal: AbortSignal) {
  return daDwg(stream, signal, async (dxf, opts) => {
    const input = join(opts.cwd, "regioni.json");
    const output = join(opts.cwd, "modello.json");
    await writeFile(input, JSON.stringify(richiesta), { mode: 0o600 });
    await exec(process.env.PLANIMETRIE_DWG_PYTHON || "python3", ["-I", ricostruttore, dxf, input, output], { ...opts, timeout: 100_000 });
    if ((await stat(output)).size > 2 * 1024 * 1024) throw new Error("Il modello contiene troppi elementi. Riduci i piani da ricostruire.");
    signal.throwIfAborted();
    return JSON.parse(await readFile(output, "utf8")) as { errore?: string; documento?: unknown; piani?: unknown };
  });
}

export function cadPreviewPlugin(): Plugin {
  let active = false;
  return {
    name: "anteprima-dwg-locale",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__planimetrie-lab/dwg", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const fail = (status: number, message: string) => {
          if (res.destroyed || res.writableEnded) return;
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        };
        if (!localPlanRequestAllowed(req)) return fail(403, "Conversione riservata alla pagina locale.");
        if (req.method !== "POST") return fail(405, "Usa POST.");
        if (req.headers["content-type"] !== "application/octet-stream") return fail(415, "Carica un file DWG.");
        if (Number(req.headers["content-length"]) > CAD_MAX_BYTES) return fail(413, "Il DWG supera 64 MB.");
        const percorso = (req.url ?? "/").split("?", 1)[0];
        if (percorso !== "/" && percorso !== "/modello") return fail(404, "Operazione CAD non disponibile.");
        let richiesta: RichiestaModelloDwg | undefined;
        if (percorso === "/modello") {
          try {
            const input = String(req.headers["x-planimetria-cad"] ?? "");
            if (input.length > 8000) throw new Error();
            richiesta = validaRichiestaModelloDwg(JSON.parse(decodeURIComponent(input)));
          } catch (error) {
            return fail(400, error instanceof Error && !(error instanceof SyntaxError) && error.message
              ? error.message : "Imposta le quote e scegli i ritagli da ricostruire.");
          }
        }
        if (active) return fail(429, "Un altro DWG è in conversione. Attendi qualche secondo e riprova.");

        const controller = new AbortController();
        const close = () => { if (!res.writableEnded) controller.abort(); };
        const deadline = setTimeout(() => { controller.abort(); req.destroy(); }, 145_000);
        res.on("close", close);
        active = true;
        try {
          if (richiesta) {
            const modello = await ricostruisciDwg(req, richiesta, controller.signal);
            if (modello.errore) return fail(422, modello.errore);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(modello));
          } else {
            const { png, riferimento } = await convertiTavolaDwg(req, controller.signal);
            if (riferimento) res.setHeader("X-Planimetria-Dwg", JSON.stringify(riferimento));
            res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
            res.end(png);
          }
        } catch (error) {
          const reason = error as NodeJS.ErrnoException & { stderr?: string };
          if (reason.code === "ENOENT" || /No module named ['"]ezdxf['"]|Library not loaded:.*libredwg/.test(reason.stderr ?? "")) {
            return fail(503, "Il motore DWG locale non è configurato. Puoi continuare caricando il PDF della tavola.");
          }
          const nonValido = /^(DWG oltre|Il (contenuto|file DWG|disegno)|La tavola|L’anteprima)/.test(reason.message);
          fail(422, nonValido ? reason.message : richiesta
            ? "La ricostruzione del disegno non è riuscita. Puoi aprire l’anteprima da ricalcare."
            : "Non riesco a leggere la tavola da questo DWG. Puoi esportare la singola pianta dal CAD in PDF.");
        } finally {
          clearTimeout(deadline);
          res.off("close", close);
          active = false;
        }
      });
    },
  };
}
