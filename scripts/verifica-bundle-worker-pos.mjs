// Fa il build di produzione del Worker che disegna il PDF del POS, senza scrivere su disco, e dice cosa ne esce.
// Lo lancia il test posPdfWorkerBundle.test.ts in un processo a parte: lo strumento di build non gira dentro l'ambiente
// jsdom dei test («TextEncoder … instanceof Uint8Array» è falso fra i due mondi). Esce con errore se il build si ferma.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esito = await build({
  configFile: false, root: radice, logLevel: "silent",
  resolve: { alias: { "@": path.resolve(radice, "src") } },
  build: { write: false, minify: false, lib: { entry: "src/lib/sicurezza/disegnaPdfPos.ts", formats: ["es"], fileName: "disegna" } },
});
const uscite = (Array.isArray(esito) ? esito : [esito]).flatMap((o) => ("output" in o ? o.output : []));
const worker = uscite.find((o) => /posPdf\.worker/.test(o.fileName));
const codice = !worker ? "" : worker.type === "chunk" ? worker.code : String(worker.source);
console.log(JSON.stringify({ trovato: !!worker, file: worker?.fileName, byte: codice.length, createPdf: codice.includes("createPdf"), roboto: codice.includes("Roboto-Regular") }));
