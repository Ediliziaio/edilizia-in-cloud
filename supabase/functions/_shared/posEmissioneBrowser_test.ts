// deno-lint-ignore-file require-await no-import-prefix -- i finti restituiscono promesse come gli oggetti veri; il bundle minificato del client si importa a nome e versione, apposta
import assert from "node:assert/strict";
import pdfMakeServer from "pdfmake";
import vfsServer from "pdfmake-fonts";
import pdfMakeClient from "npm:pdfmake@0.3.9/build/pdfmake.min.js";
import vfsClient from "npm:pdfmake@0.3.9/build/vfs_fonts.js";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { generaPdfPos } from "./posPdf.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { conservaEmissionePos, ErroreEmissionePos } from "./posEmissione.ts";
import { anteprimaHtmlPos, annullaEmissioneBrowser, completaEmissioneBrowser, LIMITE_PDF_BROWSER, preparaEmissioneBrowser } from "./posEmissioneBrowser.ts";
import type { FontiProdottiPos } from "./posPacchetto.ts";
import { registraFontPos } from "./posFont.ts";
import { companyId, emessoIl, id, memoria, posId, token } from "./posProvaMemoria.ts";

pdfMakeServer.addVirtualFileSystem(vfsServer);
// deno-lint-ignore no-explicit-any
(pdfMakeClient as any).addVirtualFileSystem(vfsClient);
// Come il Worker del browser: anche il client registra il mini-font delle caselle.
// deno-lint-ignore no-explicit-any
registraFontPos(pdfMakeClient as any);
function dati() {
  const d = esempioPdfPos();
  d.contenuto.allegati = d.contenuto.allegati.map((a, i) => ({ ...a, file_path: `${companyId}/pos/${posId}/${i}.pdf` }));
  return d;
}
const sorgente = (d = dati()) => ({ posId, companyId, attesoUpdatedAt: "2026-10-26T11:00:00+00:00", dati: d, nomeAutore: "APPROVATORE DI PROVA", fonti: async () => ({ prova: "TEST" }) });

type Preparata = { html: string; emissioneId: string; layout: string; codice: string; revisione: number; emessoIl: string };
type Dichiarato = { pdfSha256: string; htmlSha256: string; layout: string };
/** Il giro come lo fa il browser: il server prepara, il browser disegna, il server conserva. */
async function prepara(m: ReturnType<typeof memoria>, s = sorgente()) {
  const p = await preparaEmissioneBrowser(m.db, "utente-prova", s);
  assert.equal(p.giaCompleta, false);
  if (p.giaCompleta) throw new Error("atteso un modello da disegnare");
  return p;
}
/** Il PDF come lo disegna il browser: il bundle minificato del client, con i parametri che il server ha dato. */
// deno-lint-ignore no-explicit-any
const disegna = (p: Preparata) => disegnaPdfPos(pdfMakeClient as any, { html: p.html, codice: p.codice, revisione: p.revisione, emessoIl: p.emessoIl, anteprima: false, layoutServer: p.layout });
/** Ciò che il browser dichiara nella richiesta: l'impronta del PDF, quella del modello da cui l'ha disegnato e la versione del layout. */
const dichiarazione = async (pdf: Uint8Array, p: Preparata): Promise<Dichiarato> => ({ pdfSha256: await sha256Hex(pdf), htmlSha256: await sha256Hex(strToU8(p.html)), layout: p.layout });
const completa = async (m: ReturnType<typeof memoria>, pdf: Uint8Array, p: Preparata, extra: { token?: string; dichiarato?: Partial<Dichiarato>; s?: ReturnType<typeof sorgente> } = {}) =>
  completaEmissioneBrowser(m.db, "utente-prova", { companyId, emissioneId: id, token: extra.token ?? token, pdf,
    dichiarato: { ...await dichiarazione(pdf, p), ...extra.dichiarato }, sorgente: async () => extra.s ?? sorgente() });
const stato = (e: unknown) => (e as { status?: number }).status;

Deno.test("Prepara: prenota con l'autore e la versione letta, e restituisce il modello HTML del contenuto APPROVATO", async () => {
  const m = memoria();
  const p = await prepara(m);
  assert.deepEqual(m.chiamate, ["pos_prenota_emissione"]);
  assert.equal(p.emissioneId, id); assert.equal(p.token, token); assert.equal(p.emessoIl, emessoIl);
  assert.equal(p.layout, "pos-pdf-10-design"); assert.equal(p.codice, "TEST-POS-2026"); assert.equal(p.revisione, 0);
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
  const finale = await completa(m, pdf, p);
  assert.equal(finale.stato, "completa");
  const base = `${companyId}/${id}/${token}`;
  assert.deepEqual(m.store.get(`${base}/POS.pdf`), pdf);
  const manifest = m.manifest() as { generatore: string; file: Array<{ ruolo: string; sha256: string }> };
  assert.equal(manifest.generatore, "pos-pdf-10-design-browser/pdfmake-0.3.9");
  assert.equal(manifest.file.find(f => f.ruolo === "pdf")!.sha256, await sha256Hex(pdf));
  assert.deepEqual(unzipSync(m.store.get(`${base}/fascicolo.zip`)!)["POS.pdf"], pdf);
  assert.equal(strFromU8(unzipSync(m.store.get(`${base}/fascicolo.zip`)!)["modello.html"]), p.html);
  assert.equal(m.chiamate.filter(c => c === "pos_completa_emissione").length, 1);
});

Deno.test("Manifest: dice chi ha disegnato il PDF, con quale layout e con quali impronte di modello e PDF, così si può rifare e confrontare", async () => {
  const m = memoria(); const p = await prepara(m); const pdf = await disegna(p);
  await completa(m, pdf, p);
  assert.deepEqual((m.manifest() as { render: unknown }).render, {
    disegnatoDa: "browser", generatore: "pos-pdf-10-design-browser/pdfmake-0.3.9", layout: "pos-pdf-10-design",
    codice: "TEST-POS-2026", revisione: 0, emessoIl, htmlSha256: await sha256Hex(strToU8(p.html)), pdfSha256: await sha256Hex(pdf) });
});

Deno.test("Manifest: anche quando il PDF lo disegna il server, il blocco render lo dice (disegnatoDa: server)", async () => {
  const m = memoria();
  await conservaEmissionePos(m.db, "utente-prova", sorgente());
  const render = (m.manifest() as { render: Record<string, unknown> }).render;
  assert.equal(render.disegnatoDa, "server"); assert.equal(render.layout, "pos-pdf-10-design"); assert.equal(render.codice, "TEST-POS-2026");
  assert.equal(render.generatore, "pos-pdf-10-design/pdfmake-0.3.9");
  assert.equal(render.pdfSha256, await sha256Hex(m.store.get(`${companyId}/${id}/${token}/POS.pdf`)!));
});

Deno.test("Rifacibile: dal modello.html congelato e dal blocco render si rifà un PDF con la stessa impronta, con un altro bundle di pdfmake", async () => {
  const m = memoria(); const p = await prepara(m); const pdf = await disegna(p);   // disegnato con il bundle del client
  await completa(m, pdf, p);
  const render = (m.manifest() as { render: { codice: string; revisione: number; emessoIl: string; pdfSha256: string } }).render;
  const modello = strFromU8(m.store.get(`${companyId}/${id}/${token}/modello.html`)!);
  // chi verifica dopo usa il bundle del server (quello intero): stessi byte
  const rifatto = await disegnaPdfPos(pdfMakeServer, { html: modello, codice: render.codice, revisione: render.revisione, emessoIl: render.emessoIl, anteprima: false });
  assert.equal(await sha256Hex(rifatto), render.pdfSha256);
  assert.equal(await sha256Hex(m.store.get(`${companyId}/${id}/${token}/POS.pdf`)!), render.pdfSha256);
});

Deno.test("Completa: un'emissione già completa si restituisce com'è, senza nuovi upload (doppio clic)", async () => {
  const m = memoria({ stato: "completa" }); const p = await prepara(memoria());
  const finale = await completa(m, new Uint8Array([1, 2, 3]), p);
  assert.equal(finale.stato, "completa"); assert.equal(m.store.size, 0); assert.deepEqual(m.chiamate, []);
});

Deno.test("Completa: con un token che non è quello della prenotazione non tocca nulla, nemmeno la prenotazione altrui", async () => {
  const m = memoria(); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf, p, { token: "99999999-9999-4999-8999-999999999999" }), (e: unknown) => stato(e) === 409);
  assert.equal(m.riga.stato, "preparazione"); assert.equal(m.store.size, 0); assert.equal(m.scritture.length, 0);
});

Deno.test("Completa: una prenotazione scaduta non carica nulla", async () => {
  const m = memoria({ riservataFino: new Date(Date.now() - 1000).toISOString() }); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf, p), (e: unknown) => stato(e) === 409 && /scaduta/.test((e as Error).message));
  assert.equal(m.store.size, 0);
});

Deno.test("Completa: un PDF non idoneo si ferma prima dello storage e libera la prenotazione (il server controlla %PDF-, %%EOF, dimensione e impronte; non interpreta il file)", async () => {
  const m0 = memoria(); const p0 = await prepara(m0); const valido = await disegna(p0);
  const troncato = valido.slice(0, valido.length - 200);   // manca la coda con %%EOF
  const casi: Array<[string, Uint8Array, Partial<Dichiarato>, number, RegExp]> = [
    ["non è un PDF", strToU8("<html>non sono un PDF</html>"), {}, 422, /non è un PDF/],
    ["vuoto", new Uint8Array(), {}, 422, /non è un PDF/],
    ["senza la coda %%EOF (troncato)", troncato, {}, 422, /incompleto/],
    ["oltre il limite di dimensione", new Uint8Array(LIMITE_PDF_BROWSER + 1).fill(37), {}, 413, /troppo grande/],
    ["impronta del PDF diversa da quella dichiarata", valido, { pdfSha256: "0".repeat(64) }, 422, /impronta/],
    ["disegnato da un modello diverso da quello da approvare", valido, { htmlSha256: "f".repeat(64) }, 409, /cambiato/],
    ["layout dichiarato di un'altra versione", valido, { layout: "pos-pdf-8-vecchio" }, 409, /aggiorna/i],
  ];
  for (const [nome, pdf, dichiarato, atteso, messaggio] of casi) {
    const m = memoria(); await prepara(m);
    const impronta = await sha256Hex(pdf);
    await assert.rejects(() => completa(m, pdf, p0, { dichiarato: { pdfSha256: impronta, ...dichiarato } }), (e: unknown) => stato(e) === atteso && messaggio.test((e as Error).message), nome);
    assert.equal(m.store.size, 0, nome); assert.ok(!m.chiamate.includes("pos_completa_emissione"), nome); assert.equal(m.riga.stato, "errore", nome);
  }
});

Deno.test("Completa: una rilettura alterata non completa il documento, come per il PDF del server", async () => {
  const m = memoria({ corrompi: true }); const p = await prepara(m); const pdf = await disegna(p);
  await assert.rejects(() => completa(m, pdf, p), /rilettura.*non corrisponde/);
  assert.ok(!m.chiamate.includes("pos_completa_emissione")); assert.equal(m.riga.stato, "errore"); assert.equal(m.store.size, 0);
});

Deno.test("Completa: le fonti verificate (SDS) entrano nel fascicolo come nell'emissione di sempre", async () => {
  const sds = "55555555-5555-4555-8555-555555555555";
  const prodotti: FontiProdottiPos = { versione: 1, prodotti: [], allegati: [{ evidenza_id: sds, bucket: "fascicoli-cantiere", path: `${companyId}/${sds}/originale.pdf`, nome: "SDS originale.pdf", impronta: "a".repeat(64) }] };
  const d = dati(); d.contenuto.versione_prodotti = 1;
  const m = memoria({ prodotti }); const p = await prepara(m, sorgente(d)); const pdf = await disegna(p);
  await completa(m, pdf, p, { s: sorgente(d) });
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
  assert.equal(r.layout, "pos-pdf-10-design"); assert.equal(r.codice, "TEST-POS-2026"); assert.equal(r.revisione, 0); assert.equal(r.emessoIl, "2026-10-30T09:00:00Z");
});

Deno.test("Anteprima: un carattere senza glifo si ferma con il messaggio di sempre, prima che il browser lavori", () => {
  const d = dati(); d.contenuto.impresa.datore_lavoro = "测试";
  assert.throws(() => anteprimaHtmlPos(d, "2026-10-30T09:00:00Z"), /font aggiuntivo.*U\+/);
});

Deno.test("Coerenza: il messaggio dei glifi mancanti è lo stesso in preparazione (browser) e nel disegno del server", async () => {
  const d = dati(); d.contenuto.impresa.datore_lavoro = "测试";
  const dalServer = await generaPdfPos(d, emessoIl).then(() => "", (e: Error) => e.message);
  const inPreparazione = (() => { try { anteprimaHtmlPos({ ...d, stato: "approvato" }, emessoIl); return ""; } catch (e) { return (e as Error).message; } })();
  assert.match(dalServer, /font aggiuntivo/);
  assert.equal(inPreparazione, dalServer);
});
