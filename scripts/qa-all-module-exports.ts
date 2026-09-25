/** Offline regression of every standard, with the native per-engine QA harnesses. */
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODULE68_EXPECTED } from "../src/test/audits/module68ContentAudit";

const output = path.resolve(process.argv[2] || "../all-module-export-qa");
const scripts: Record<string, string> = { serramenti: "serramenti.tsx", tetti: "tetti.tsx", ristrutturazioni: "ristrutturazioni.tsx", bagni: "bagni.tsx", fotovoltaico: "fv.ts", climatizzazione: "climatizzazione.tsx", termoidraulica: "termoidraulico.tsx", elettrico: "elettrico.tsx", pavimenti: "pavimenti.tsx", piscine: "piscine.tsx", facciate: "facciate.tsx" };
const jobs = Object.entries(MODULE68_EXPECTED).flatMap(([area, ids]) => ids.map(id => ({ area, id })));
const results: Array<{ area: string; id: string; passed: boolean; pdfs: number; html: number; log: string }> = [];
let next = 0;
await mkdir(output, { recursive: true });
async function worker() {
  while (next < jobs.length) {
    const { area, id } = jobs[next++];
    const destination = path.join(output, area, id);
    await mkdir(destination, { recursive: true });
    const child = spawn(process.execPath, [`scripts/qa-full-${scripts[area]}`, destination, id], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", chunk => { log += chunk; });
    child.stderr.on("data", chunk => { log += chunk; });
    const code = await new Promise<number | null>((resolve, reject) => { child.on("close", resolve); child.on("error", reject); });
    await writeFile(path.join(destination, "qa.log"), log);
    const files = await readdir(destination);
    const row = { area, id, passed: code === 0, pdfs: files.filter(file => file.endsWith(".pdf")).length, html: files.filter(file => file.endsWith(".html") && !file.endsWith("-screen.html")).length, log: path.join(destination, "qa.log") };
    results.push(row);
    console.log(`${row.passed ? "PASS" : "FAIL"} ${area}/${id} · ${row.pdfs} PDF · ${row.html} HTML`);
  }
}
await Promise.all([worker(), worker()]);
results.sort((a, b) => `${a.area}/${a.id}`.localeCompare(`${b.area}/${b.id}`));
const summary = { generatedAt: new Date().toISOString(), models: results.length, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length, pdfs: results.reduce((n, row) => n + row.pdfs, 0), htmlVariants: results.reduce((n, row) => n + row.html, 0), limitation: "Automated export checks; not a page-by-page visual approval. Photovoltaic output is HTML, not final PDF." };
await writeFile(path.join(output, "report.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
process.exitCode = summary.failed ? 1 : 0;
