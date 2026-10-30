// deno-lint-ignore-file require-await -- i finti restituiscono promesse come gli oggetti veri, senza aspettare niente
import assert from "node:assert/strict";
import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { generaPdfPos } from "./posPdf.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { ErroreEmissionePos } from "./posEmissione.ts";
import { anteprimaHtmlPos, annullaEmissioneBrowser, completaEmissioneBrowser, LIMITE_PDF_BROWSER, preparaEmissioneBrowser } from "./posEmissioneBrowser.ts";
import type { FontiProdottiPos } from "./posPacchetto.ts";

pdfMake.addVirtualFileSystem(vfs);
import { companyId, emessoIl, id, memoria, posId, token } from "./posProvaMemoria.ts";
function dati() {
  const d = esempioPdfPos();
  d.contenuto.allegati = d.contenuto.allegati.map((a, i) => ({ ...a, file_path: `${companyId}/pos/${posId}/${i}.pdf` }));
  return d;
}
const sorgente = (d = dati()) => ({ posId, companyId, attesoUpdatedAt: "2026-10-26T11:00:00+00:00", dati: d, nomeAutore: "APPROVATORE DI PROVA", fonti: async () => ({ prova: "TEST" }) });

/** Il giro completo come lo fa il browser: il server prepara, il browser disegna, il server conserva. */
async function prepara(m: ReturnType<typeof memoria>, s = sorgente()) {
  const p = await preparaEmissioneBrowser(m.db, "utente-prova", s);
  assert.equal(p.giaCompleta, false);
  if (p.giaCompleta) throw new Error("atteso un modello da disegnare");
  return p;
}
async function disegna(p: { html: string; emissioneId: string; layout: string; codice: string; revisione: number; emessoIl: string }, htmlSha256?: string) {
  return disegnaPdfPos(pdfMake, { html: p.html, codice: p.codice, revisione: p.revisione, emessoIl: p.emessoIl, anteprima: false, layoutServer: p.layout,
    legame: { emissioneId: p.emissioneId, htmlSha256: htmlSha256 ?? await sha256Hex(strToU8(p.html)) } });
}
const completa = async (m: ReturnType<typeof memoria>, pdf: Uint8Array, extra: Partial<{ token: string; pdfSha256: string; s: ReturnType<typeof sorgente> }> = {}) =>
  completaEmissioneBrowser(m.db, "utente-prova", { companyId, emissioneId: id, token: extra.token ?? token, pdf, pdfSha256: extra.pdfSha256 ?? await sha256Hex(pdf), sorgente: async () => extra.s ?? sorgente() });
const stato = (e: unknown) => (e as { status?: number }).status;

Deno.test("Prepara: prenota con l'autore e la versione letta, e restituisce il modello HTML del contenuto APPROVATO", async () => {
  const m = memoria();
  const p = await prepara(m);
  assert.deepEqual(m.chiamate, ["pos_prenota_emissione"]);
  assert.equal(p.emissioneId, id); assert.equal(p.token, token); assert.equal(p.emessoIl, emessoIl);
  assert.equal(p.layout, "pos-pdf-9-riferimento-psc"); assert.equal(p.codice, "TEST-POS-2026"); assert.equal(p.revisione, 0);
  assert.match(p.html, /APPROVATORE DI PROVA/);   // chi approva, non l'approvatore del dato di partenza
  assert.doesNotMatch(p.html, /BOZZA/);            // contenuto approvato, non una bozza
});

Deno.test("Prepara: un'emissione già completa non si prenota né si rilegge di nuovo", async () => {
  const m = memoria({ stato: "completa" });
  const p = await preparaEmissioneBrowser(m.db, "utente-prova", { ...sorgente(), fonti: async () => { throw new Error("non rileggere"); } });
  assert.equal(p.giaCompleta, true);
  assert.deepEqual(m.chiamate, ["pos_prenota_emissione"]);
});

Deno.test("Prepara: un carattere senza glifo ferma prima del disegno, dice dove sta e libera la prenotazione", async () => {
  const m = memoria(); const d = dati(); d.contenuto.impresa.datore_lavoro = "测试";
  await assert.rejects(() => preparaEmissioneBrowser(m.db, "utente-prova", sorgente(d)), (e: unknown) => e instanceof ErroreEmissionePos && stato(e) === 422 && /font aggiuntivo.*U\+.*Nessuna emissione/.test(e.message));
  assert.equal(m.riga.stato, "errore");
});

Deno.test("Prepara: una fonte che non si verifica ferma subito, prima che l'utente aspetti il disegno", async () => {
  const m = memoria(); const d = dati(); d.contenuto.versione_prodotti = 1;
  await assert.rejects(() => preparaEmissioneBrowser(m.db, "utente-prova", sorgente(d)), (e: unknown) => stato(e) === 409);
  assert.equal(m.riga.stato, "errore");
});

Deno.test("Completa: conserva il PDF del browser byte per byte e completa solo dopo upload e rilettura", async () => {
  const m = memoria(); const p = await prepara(m); const pdf = await disegna(p);
  const finale = await completa(m, pdf);
  assert.equal(finale.stato, "completa");
  const base = `${companyId}/${id}/${token}`;
  assert.deepEqual(m.store.get(`${base}/POS.pdf`), pdf);
  const manifest = m.manifest() as { generatore: string; file: Array<{ ruolo: string; sha256: string; nome: string }> };
  assert.equal(manifest.generatore, "pos-pdf-9-riferimento-psc-browser/pdfmake-0.3.9");
  assert.equal(manifest.file.find(f => f.ruolo === "pdf")!.sha256, await sha256Hex(pdf));
  assert.deepEqual(unzipSync(m.store.get(`${base}/fascicolo.zip`)!)["POS.pdf"], pdf);
  assert.equal(strFromU8(unzipSync(m.store.get(`${base}/fascicolo.zip`)!)["modello.html"]), p.html);
  assert.equal(m.chiamate.filter(c => c === "pos_completa_emissione").length, 1);
});

Deno.test("Completa: un'emissione già completa si restituisce com'è, senza nuovi upload (doppio clic)", async () => {
  const m = memoria({ stato: "completa" });
  const finale = await completa(m, new Uint8Array([1, 2, 3]));
  assert.equal(finale.stato, "completa"); assert.equal(m.store.size, 0); assert.deepEqual(m.chiamate, []);
});

Deno.test("Completa: con un token che non è quello della prenotazione non tocca nulla, nemmeno la prenotazione altrui", async () => {
  const m = memoria(); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf, { token: "99999999-9999-4999-8999-999999999999" }), (e: unknown) => stato(e) === 409);
  assert.equal(m.riga.stato, "preparazione"); assert.equal(m.store.size, 0); assert.equal(m.scritture.length, 0);
});

Deno.test("Completa: una prenotazione scaduta non carica nulla", async () => {
  const m = memoria({ riservataFino: new Date(Date.now() - 1000).toISOString() }); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf), (e: unknown) => stato(e) === 409 && /scaduta/.test((e as Error).message));
  assert.equal(m.store.size, 0);
});

Deno.test("Completa: un PDF non idoneo si ferma prima dello storage e libera la prenotazione", async () => {
  const m0 = memoria(); const p0 = await prepara(m0); const valido = await disegna(p0);
  const altroId = "55555555-5555-4555-8555-555555555555";
  const dalServer = (await generaPdfPos(dati(), emessoIl)).bytes;
  const casi: Array<[string, () => Promise<{ pdf: Uint8Array; pdfSha256?: string }>, number, RegExp]> = [
    ["non è un PDF", async () => ({ pdf: strToU8("<html>non sono un PDF</html>") }), 422, /PDF/],
    ["vuoto", async () => ({ pdf: new Uint8Array() }), 422, /PDF/],
    ["oltre il limite di dimensione", async () => ({ pdf: new Uint8Array(LIMITE_PDF_BROWSER + 1).fill(37) }), 413, /troppo grande/],
    ["impronta dichiarata diversa da quella ricevuta", async () => ({ pdf: valido, pdfSha256: "0".repeat(64) }), 422, /impronta/],
    ["senza legame (quello del server)", async () => ({ pdf: dalServer }), 422, /non dichiara/],
    ["disegnato per un'altra emissione", async () => ({ pdf: await disegna({ ...p0, emissioneId: altroId }) }), 409, /altra emissione/],
    ["disegnato su un contenuto diverso da quello da approvare", async () => ({ pdf: await disegna(p0, "f".repeat(64)) }), 409, /cambiato/],
  ];
  for (const [nome, costruisci, atteso, messaggio] of casi) {
    const m = memoria(); await prepara(m);
    const { pdf, pdfSha256 } = await costruisci();
    const impronta = pdfSha256 ?? await sha256Hex(pdf);
    await assert.rejects(() => completa(m, pdf, { pdfSha256: impronta }), (e: unknown) => stato(e) === atteso && messaggio.test((e as Error).message), nome);
    assert.equal(m.store.size, 0, nome); assert.ok(!m.chiamate.includes("pos_completa_emissione"), nome); assert.equal(m.riga.stato, "errore", nome);
  }
});

Deno.test("Completa: un PDF disegnato con un'altra versione del layout non passa", async () => {
  const m = memoria(); const p = await prepara(m);
  const htmlSha256 = await sha256Hex(strToU8(p.html));
  const vecchio = new Uint8Array(await pdfMake.createPdf({ pageSize: "A4", defaultStyle: { font: "Roboto" }, content: [{ text: "x" }],
    info: { PosEmissione: id, PosHtmlSha256: htmlSha256, PosLayout: "pos-pdf-8-vecchio" } } as never).getBuffer());
  await assert.rejects(() => completa(m, vecchio), (e: unknown) => stato(e) === 409 && /aggiorna/i.test((e as Error).message));
  assert.equal(m.store.size, 0);
});

Deno.test("Completa: una rilettura alterata non completa il documento, come per il PDF del server", async () => {
  const m = memoria({ corrompi: true }); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf), /rilettura.*non corrisponde/);
  assert.ok(!m.chiamate.includes("pos_completa_emissione")); assert.equal(m.riga.stato, "errore"); assert.equal(m.store.size, 0);
});

Deno.test("Completa: le fonti verificate (SDS) entrano nel fascicolo come nell'emissione di sempre", async () => {
  const sds = "55555555-5555-4555-8555-555555555555";
  const prodotti: FontiProdottiPos = { versione: 1, prodotti: [], allegati: [{ evidenza_id: sds, bucket: "fascicoli-cantiere", path: `${companyId}/${sds}/originale.pdf`, nome: "SDS originale.pdf", impronta: "a".repeat(64) }] };
  const d = dati(); d.contenuto.versione_prodotti = 1;
  const m = memoria({ prodotti }); const p = await prepara(m, sorgente(d)); const pdf = await disegna(p);
  await completa(m, pdf, { s: sorgente(d) });
  const manifest = m.manifest() as { prodotti_sds?: unknown; file: Array<{ evidenza_id?: string }> };
  assert.ok(manifest.prodotti_sds); assert.ok(manifest.file.some(f => f.evidenza_id === sds));
});

Deno.test("Annulla: con il token giusto libera subito la prenotazione; con uno sbagliato non tocca quella in corso", async () => {
  const m = memoria();
  await annullaEmissioneBrowser(m.db, companyId, id, "99999999-9999-4999-8999-999999999999");
  assert.equal(m.riga.stato, "preparazione");
  await annullaEmissioneBrowser(m.db, companyId, id, token);
  assert.equal(m.riga.stato, "errore");
  await annullaEmissioneBrowser(m.db, companyId, id, token); // ripetere non è un errore
});

Deno.test("Anteprima: l'HTML è quello della bozza con avvertenze, già controllato nei glifi, e non prenota nulla", () => {
  const r = anteprimaHtmlPos({ ...dati(), stato: "approvato" }, "2026-10-30T09:00:00Z");
  assert.match(r.html, /BOZZA/);                    // anche se il contenuto è già approvato, l'anteprima non si spaccia per l'originale
  assert.equal(r.layout, "pos-pdf-9-riferimento-psc"); assert.equal(r.codice, "TEST-POS-2026"); assert.equal(r.revisione, 0); assert.equal(r.emessoIl, "2026-10-30T09:00:00Z");
});

Deno.test("Anteprima: un carattere senza glifo si ferma con il messaggio di sempre, prima che il browser lavori", () => {
  const d = dati(); d.contenuto.impresa.datore_lavoro = "测试";
  assert.throws(() => anteprimaHtmlPos(d, "2026-10-30T09:00:00Z"), /font aggiuntivo.*U\+/);
});
