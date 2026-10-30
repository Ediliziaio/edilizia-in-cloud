import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { preparaPacchettoPos } from "./posPacchetto.ts";
import { BASE_VERIFICA_POS, urlVerificaPos } from "./posVerifica.ts";

const companyId = "11111111-1111-4111-8111-111111111111", posId = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333", token = "44444444-4444-4444-8444-444444444444";
const identita = { id, tentativoId: token, companyId, posId, emessoIl: "2026-10-26T12:00:00Z", origine: "approvazione_corrente" as const };
const byteAllegato = new TextEncoder().encode("BYTE ORIGINALI SINTETICI");
const dati = () => {
  const d = esempioPdfPos();
  d.contenuto.allegati = d.contenuto.allegati.map((a, i) => ({ ...a, file_path: `${companyId}/pos/${posId}/${i}.pdf` }));
  return d;
};

Deno.test("Indirizzo di verifica: dominio canonico, id in minuscolo, nessuna base storta", () => {
  assert.equal(urlVerificaPos(id), `${BASE_VERIFICA_POS}/verifica-pos/${id}`);
  assert.equal(urlVerificaPos(id.toUpperCase()), `${BASE_VERIFICA_POS}/verifica-pos/${id}`);
  assert.equal(urlVerificaPos(id, "https://staging.esempio.it/"), `https://staging.esempio.it/verifica-pos/${id}`);
  assert.equal(urlVerificaPos(id, "https://localhost:8443"), `https://localhost:8443/verifica-pos/${id}`);
  // una base non valida non ferma l'emissione: si torna al dominio canonico
  for (const brutta of ["http://app.esempio.it", "https://app.esempio.it/percorso?x=1", "javascript:alert(1)", "https://utente:pw@app.esempio.it", "https://", "", "   ", null, undefined]) {
    assert.equal(urlVerificaPos(id, brutta as string | null | undefined), `${BASE_VERIFICA_POS}/verifica-pos/${id}`, String(brutta));
  }
  for (const cattivo of ["", "non-un-uuid", `${id}/../x`, `${id}?a=b`, "3333"]) assert.throws(() => urlVerificaPos(cattivo), /non valido/);
});

Deno.test("Emissione: il QR porta alla verifica di QUESTA emissione, nel PDF, nel modello congelato e nel manifest", async () => {
  const p = await preparaPacchettoPos(identita, dati(), async () => byteAllegato, { riferimento: "TEST" });
  const atteso = `${BASE_VERIFICA_POS}/verifica-pos/${id}`;
  assert.equal(p.manifest.urlVerifica, atteso);
  const zip = unzipSync(p.oggetti.find((f) => f.path === p.zipPath)!.bytes);
  assert.ok(strFromU8(zip["modello.html"]).includes(`data-url="${atteso}"`), "il modello congelato contiene l'indirizzo di verifica");
  assert.equal(JSON.parse(strFromU8(zip["manifest.json"])).urlVerifica, atteso);
  assert.equal(new TextDecoder().decode(zip["POS.pdf"].slice(0, 5)), "%PDF-");
  // Stessa emissione = stessi byte: il QR non introduce nulla di casuale.
  const q = await preparaPacchettoPos(identita, dati(), async () => byteAllegato, { riferimento: "TEST" });
  assert.deepEqual(q.oggetti.find((f) => f.path === q.pdfPath)!.bytes, p.oggetti.find((f) => f.path === p.pdfPath)!.bytes);
  // Il contenuto approvato (e la sua impronta) non cambia per colpa dell'indirizzo.
  assert.equal(q.manifest.contenutoSha256, p.manifest.contenutoSha256);
});

Deno.test("Emissione: una base di verifica scelta dall'ambiente si usa; una sbagliata non ferma nulla", async () => {
  const Deno_ = (globalThis as unknown as { Deno: { env: { set(k: string, v: string): void; delete(k: string): void } } }).Deno;
  try {
    Deno_.env.set("POS_VERIFICA_BASE_URL", "https://prova.esempio.it");
    const a = await preparaPacchettoPos(identita, dati(), async () => byteAllegato, { riferimento: "TEST" });
    assert.equal(a.manifest.urlVerifica, `https://prova.esempio.it/verifica-pos/${id}`);
    Deno_.env.set("POS_VERIFICA_BASE_URL", "ftp://sbagliata");
    const b = await preparaPacchettoPos(identita, dati(), async () => byteAllegato, { riferimento: "TEST" });
    assert.equal(b.manifest.urlVerifica, `${BASE_VERIFICA_POS}/verifica-pos/${id}`);
  } finally { Deno_.env.delete("POS_VERIFICA_BASE_URL"); }
});
