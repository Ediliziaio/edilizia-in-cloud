import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import { localPlanRequestAllowed } from "../preventivatore-ai/planOcrPlugin.mts";
import { glbAutonomo, leggiParametri, MAX_GLB, tempoMassimoMs } from "./renderParametri.mts";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("./renderFotorealistico.py", import.meta.url));
const panorama = fileURLToPath(new URL("./ambiente-cortile.exr", import.meta.url));
const MAX_ATTIVI = 2;

export function renderFotorealisticoPlugin(blender: string, cache: string): Plugin {
  let attivi = 0;
  let usaMetal = process.platform === "darwin" && process.arch === "arm64" && process.env.PLANIMETRIE_CYCLES_DEVICE === "METAL";
  const inCorso = new Map<string, Promise<Buffer>>();
  const firmaPanorama = readFile(panorama).then(file => createHash("sha256").update(file).digest("hex"), () => "");

  return {
    name: "planimetrie-cycles-locale",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__planimetrie/render-fotorealistico", async (req, res) => {
        const json = (codice: number, error: string) => {
          if (res.destroyed || res.writableEnded) return;
          res.writeHead(codice, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error }));
        };
        if (!localPlanRequestAllowed(req)) return json(403, "Usa il render dal sito locale.");
        if (req.method !== "POST") return json(405, "Apri il render dalla chat di Silvio.");
        if (req.headers["content-type"] !== "model/gltf-binary") return json(415, "Il motore si aspetta un modello GLB.");
        let parametri;
        try { parametri = leggiParametri(req.headers["x-planimetria-render"]); } catch { parametri = null; }
        if (!parametri) return json(400, "Inquadratura non valida.");
        if (Number(req.headers["content-length"]) > MAX_GLB) return json(413, "La scena supera 24 MB.");
        try {
          const pezzi: Buffer[] = [];
          let dimensione = 0;
          for await (const pezzo of req) {
            const buffer = Buffer.isBuffer(pezzo) ? pezzo : Buffer.from(pezzo);
            dimensione += buffer.length;
            if (dimensione > MAX_GLB) return json(413, "La scena supera 24 MB.");
            pezzi.push(buffer);
          }
          if (res.destroyed) return;
          const glb = Buffer.concat(pezzi);
          if (!glbAutonomo(glb)) return json(400, "La scena GLB deve contenere tutta la geometria.");
          const opzioni = JSON.stringify(parametri);
          const hash = createHash("sha256").update(glb).update(opzioni).update(await readFile(script))
            .update(parametri.luce === "diffusa" ? await firmaPanorama : "").digest("hex");
          const destinazione = join(cache, hash + ".png");
          let png = await readFile(destinazione).catch(() => null);
          if (!png) {
            let lavoro = inCorso.get(hash);
            if (!lavoro) {
              if (attivi >= (usaMetal ? 1 : MAX_ATTIVI)) return json(429, "Ci sono render in corso. Riprova tra poco.");
              attivi++;
              lavoro = (async () => {
                let cartella: string | undefined;
                try {
                  await mkdir(cache, { recursive: true });
                  cartella = await mkdtemp(join(cache, "calcolo-"));
                  const modello = join(cartella, "modello.glb");
                  const camera = join(cartella, "camera.json");
                  const uscita = join(cartella, "render.png");
                  await Promise.all([writeFile(modello, glb), writeFile(camera, opzioni)]);
                  const calcola = (dispositivo: "METAL" | "CPU") => exec(blender,
                    ["--background", "--factory-startup", "--disable-autoexec", "--threads", dispositivo === "METAL" ? "4" : "6",
                      "--python-exit-code", "2", "--python", script, "--", modello, camera, uscita],
                    { cwd: cartella, env: { ...process.env, PLANIMETRIE_CYCLES_DEVICE: dispositivo },
                      timeout: tempoMassimoMs(parametri), maxBuffer: 1024 * 1024 });
                  if (usaMetal) {
                    try {
                      await calcola("METAL");
                    } catch {
                      usaMetal = false;
                      server.config.logger.warn("[Render Cycles] Passaggio al calcolo su CPU.");
                      await calcola("CPU");
                    }
                  } else {
                    await calcola("CPU");
                  }
                  const immagine = await readFile(uscita);
                  await rename(uscita, destinazione);
                  return immagine;
                } finally {
                  attivi--;
                  inCorso.delete(hash);
                  if (cartella) await rm(cartella, { recursive: true, force: true }).catch(() => undefined);
                }
              })();
              inCorso.set(hash, lavoro);
            }
            png = await lavoro;
          }
          if (!res.destroyed) {
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Render-Immagine": hash });
            res.end(png);
          }
        } catch (error) {
          const e = error as { code?: string; signal?: string; stderr?: string; message?: string };
          server.config.logger.error("[Render Cycles] " + (e.stderr?.split("\n").slice(-9).join("\n") || e.message || "Errore nel calcolo"));
          return json(500, e.code === "ENOENT" ? "Blender non è configurato sul server locale."
            : e.signal ? "Il calcolo ha superato il tempo a disposizione. Prova una vista alla volta." : "Blender non è riuscito a calcolare questa vista.");
        }
      });
    },
  };
}
