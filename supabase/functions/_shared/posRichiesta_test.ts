import assert from "node:assert/strict";
import { leggiRichiestaPos } from "./posRichiesta.ts";
import { LIMITE_PDF_BROWSER } from "./posEmissioneBrowser.ts";

const multipart = (meta: unknown, pdf?: Uint8Array | null, intestazioni: Record<string, string> = {}) => {
  const f = new FormData();
  if (meta !== undefined) f.set("meta", typeof meta === "string" ? meta : JSON.stringify(meta));
  if (pdf) f.set("pdf", new File([new Uint8Array(pdf)], "POS.pdf", { type: "application/pdf" }));
  return new Request("https://funzione.invalid/genera-pos", { method: "POST", body: f, headers: intestazioni });
};
const stato = (e: unknown) => (e as { status?: number }).status;

Deno.test("Richiesta: un JSON si legge come sempre e non porta un PDF", async () => {
  const r = await leggiRichiestaPos(new Request("https://funzione.invalid/genera-pos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "crea", company_id: "c" }) }));
  assert.deepEqual(r.body, { azione: "crea", company_id: "c" }); assert.equal(r.pdf, undefined);
});

Deno.test("Richiesta: un JSON illeggibile diventa un corpo vuoto, come prima", async () => {
  const r = await leggiRichiestaPos(new Request("https://funzione.invalid/genera-pos", { method: "POST", body: "non è json" }));
  assert.deepEqual(r.body, {});
});

Deno.test("Richiesta: il multipart porta i dati nel campo meta e i byte del PDF intatti", async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 255, 128, 10, 13]);
  const r = await leggiRichiestaPos(multipart({ azione: "completa_emissione", emissione_id: "e1", token: "t1" }, pdf));
  assert.deepEqual(r.body, { azione: "completa_emissione", emissione_id: "e1", token: "t1" });
  assert.deepEqual(r.pdf, pdf);
});

Deno.test("Richiesta: un multipart senza meta valido, o con meta che non è un oggetto, è una richiesta sbagliata (400)", async () => {
  for (const meta of [undefined, "{rotto", "[1,2]", "null", "\"testo\""]) {
    await assert.rejects(() => leggiRichiestaPos(multipart(meta, new Uint8Array([1]))), (e: unknown) => stato(e) === 400, String(meta));
  }
});

Deno.test("Richiesta: un PDF troppo grande si rifiuta (413), dichiarato nell'intestazione o davvero ricevuto", async () => {
  await assert.rejects(() => leggiRichiestaPos(multipart({ azione: "completa_emissione" }, new Uint8Array([1]), { "Content-Length": String(LIMITE_PDF_BROWSER + 2 * 1024 * 1024) })), (e: unknown) => stato(e) === 413);
  await assert.rejects(() => leggiRichiestaPos(multipart({ azione: "completa_emissione" }, new Uint8Array(LIMITE_PDF_BROWSER + 1))), (e: unknown) => stato(e) === 413);
});

Deno.test("Richiesta: un campo pdf che non è un file non passa per un PDF", async () => {
  const f = new FormData(); f.set("meta", JSON.stringify({ azione: "completa_emissione" })); f.set("pdf", "%PDF-testo finto");
  await assert.rejects(() => leggiRichiestaPos(new Request("https://funzione.invalid/genera-pos", { method: "POST", body: f })), (e: unknown) => stato(e) === 400);
});
