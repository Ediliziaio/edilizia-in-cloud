// Real offline engine tests, separate from jsdom/mocked UI tests. No external services.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "eic-ocr-test-"));
after(() => rm(dir, { recursive: true, force: true })); // exact owned test directory only
const source = resolve("dev/preventivatore-ai/PlanOcr.swift");
const hash = createHash("sha256").update(await readFile(source)).digest("hex").slice(0, 16);
const binary = resolve(`node_modules/.cache/quote-plan-ocr/plan-ocr-${hash}`);
await exec("xcrun", ["swiftc", source, "-O", "-o", binary], { timeout: 90_000 });
async function read(file, page = 1) { const { stdout } = await exec(binary, [file, String(page)], { timeout: 35_000 }); return JSON.parse(stdout); }
function pdf(labels) {
  const pageIds = labels.map((_, i) => 4 + i * 2);
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${labels.length} /Kids [${pageIds.map(n => `${n} 0 R`).join(" ")}] >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  labels.forEach(label => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`);
    const stream = `BT /F1 32 Tf 80 650 Td (${label}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  let value = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(value)); value += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(value);
  value += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return value;
}
test("JPEG reale: testo e coordinate della planimetria, non fixture precompilata", async () => {
  const r = await read(resolve("src/components/quotes/dev/assets/planimetria-esempio.jpg"));
  assert.equal(r.engine, "Apple Vision locale"); assert.equal(r.pages, 1);
  assert.ok(r.lines.some(l => l.text.toLowerCase() === "cucina"));
  assert.ok(r.lines.some(l => l.text.includes("4.61")));
  for (const line of r.lines) assert.ok(line.bbox.length === 4 && line.bbox.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
});
test("PDF a due pagine: legge la pagina richiesta, senza mescolare testi", async () => {
  const file = join(dir, "two-pages.pdf"); await writeFile(file, pdf(["CUCINA", "BAGNO"]));
  const first = await read(file, 1); const second = await read(file, 2);
  assert.equal(first.pages, 2); assert.equal(second.page, 2);
  assert.ok(first.lines.some(l => l.text.includes("CUCINA"))); assert.ok(second.lines.some(l => l.text.includes("BAGNO")));
  assert.ok(!second.lines.some(l => l.text.includes("CUCINA")));
});
test("pagina inesistente, PDF oltre limite e file illeggibile falliscono senza dati parziali", async () => {
  const file = join(dir, "broken.pdf"); await writeFile(file, "not a document"); await assert.rejects(read(file));
  await writeFile(file, pdf(["CUCINA"])); await assert.rejects(read(file, 2));
  await writeFile(file, pdf(Array.from({ length: 21 }, () => "CUCINA"))); await assert.rejects(read(file));
  await assert.rejects(read(resolve("src/components/quotes/dev/assets/planimetria-esempio.jpg"), 2));
});
