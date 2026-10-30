// deno-lint-ignore-file require-await no-import-prefix -- i finti restituiscono promesse come gli oggetti veri; il bundle minificato del client si importa a nome e versione, apposta
import assert from "node:assert/strict";
import pdfMakeClient from "npm:pdfmake@0.3.9/build/pdfmake.min.js";
import vfsClient from "npm:pdfmake@0.3.9/build/vfs_fonts.js";
import { strToU8 } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { registraFontPos } from "./posFont.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { posVuoto } from "./posModello.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { gestisciAzioneBrowserPos } from "./posAzioniBrowser.ts";
import { AZIONI_BROWSER_POS, AZIONI_POS, scriveAzionePos } from "./posAzioni.ts";
import { companyId, id, memoria, posId, token } from "./posProvaMemoria.ts";

// deno-lint-ignore no-explicit-any
(pdfMakeClient as any).addVirtualFileSystem(vfsClient);
// Come il Worker del browser: il mini-font delle caselle (posFont.ts).
// deno-lint-ignore no-explicit-any
registraFontPos(pdfMakeClient as any);
const ordineId = "66666666-6666-4666-8666-666666666666";
const versionePos = "2026-10-26T11:00:00+00:00"; // è la versione che memoria() ha prenotato (sorgente_updated_at)

function riga(extra: Record<string, unknown> = {}) {
  const contenuto = esempioPdfPos().contenuto;
  contenuto.allegati = [];
  return { id: posId, company_id: companyId, order_id: ordineId, status: "bozza", contenuto, revisione: 0, revisioni: [{ rev: 0, data: "2026-10-25", descrizione: "Prima emissione" }],
    approvato_da_nome: null, approvato_il: null, updated_at: versionePos, document_type: "pos", ...extra };
}
/** Il database delle emissioni (finto che applica i filtri) più le altre tabelle che l'azione legge. */
function ambiente(pos = riga()) {
  const m = memoria();
  const tabelle: Record<string, unknown> = { pos_documents: pos, orders: { order_code: "ORD-1" }, profiles: { first_name: "Mario", last_name: "Rossi", email: "m@x.it" } };
  const db = { ...m.db, from: (t: string) => {
    if (t === "pos_emissioni") return m.db.from(t);
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: tabelle[t] ?? null, error: null }) };
    return q;
  } };
  const rilevaFonti = async () => ({ order: { order_code: "ORD-1" }, contenuto: posVuoto(), contesto: { mezzi: [], subappaltatori: [], avvisi: [] }, fonti: { origine: "test" } });
  const chiama = (azione: (typeof AZIONI_BROWSER_POS)[number], body: Record<string, unknown>, pdf?: Uint8Array, azienda = companyId) =>
    gestisciAzioneBrowserPos({ azione, db, userId: "utente-prova", companyId: azienda, body, pdf, rilevaFonti, caricaPos: async () => pos });
  return { m, chiama, tabelle };
}
const approva = { pos_id: posId, versione_client: 2, attesa_updated_at: versionePos };

Deno.test("Azioni: le quattro azioni del PDF disegnato dal browser sono registrate, e solo l'anteprima è lettura", () => {
  for (const a of AZIONI_BROWSER_POS) assert.ok(AZIONI_POS.includes(a), a);
  assert.deepEqual(AZIONI_BROWSER_POS.filter(a => !scriveAzionePos(a)), ["anteprima_html"]);
});

Deno.test("Anteprima: l'HTML della bozza, con la data dal server (non dal browser) e il layout che il Worker deve avere", async () => {
  const { chiama } = ambiente();
  const prima = Date.now();
  const r = await chiama("anteprima_html", { pos_id: posId });
  assert.equal(r.status, 200);
  const c = r.corpo as { ok: boolean; html: string; layout: string; codice: string; revisione: number; emessoIl: string };
  assert.equal(c.ok, true); assert.match(c.html, /BOZZA/); assert.equal(c.layout, "pos-pdf-10-design"); assert.equal(c.codice, "ORD-1"); assert.equal(c.revisione, 0);
  assert.ok(Date.parse(c.emessoIl) >= prima - 1000 && Date.parse(c.emessoIl) <= Date.now() + 1000, "l'istante è quello del server, adesso");
});

Deno.test("Azioni sul POS: senza pos_id è una richiesta sbagliata (400), non un errore del server", async () => {
  const { chiama } = ambiente();
  for (const a of ["anteprima_html", "prepara_emissione"] as const) assert.equal((await chiama(a, {})).status, 400, a);
});

Deno.test("Prepara: prenota la versione letta e restituisce al browser il modello, la prenotazione e la data di emissione del server", async () => {
  const { m, chiama } = ambiente();
  const r = await chiama("prepara_emissione", approva);
  assert.equal(r.status, 200);
  const c = r.corpo as Record<string, unknown>;
  assert.deepEqual({ ok: c.ok, emissione_id: c.emissione_id, token: c.token, emesso_il: c.emesso_il, layout: c.layout, codice: c.codice, revisione: c.revisione },
    { ok: true, emissione_id: id, token, emesso_il: "2026-10-26T12:00:00+00:00", layout: "pos-pdf-10-design", codice: "ORD-1", revisione: 0 });
  assert.match(String(c.html), /Mario Rossi/);   // chi approva, dal profilo letto dal server
  assert.deepEqual(m.chiamate, ["pos_prenota_emissione"]);
});

Deno.test("Prepara: le voci mancanti dell'Allegato XV tornano con il loro elenco (422) e non si prenota niente", async () => {
  const { m, chiama } = ambiente(riga({ contenuto: posVuoto() }));
  const r = await chiama("prepara_emissione", approva);
  assert.equal(r.status, 422);
  const c = r.corpo as { ok: boolean; error: string; mancanti: Array<{ riferimento: string; testo: string }> };
  assert.equal(c.ok, false); assert.match(c.error, /contenuti minimi/); assert.ok(c.mancanti.length >= 1 && c.mancanti[0].riferimento && c.mancanti[0].testo);
  assert.deepEqual(m.chiamate, []);
});

Deno.test("Prepara: un POS già approvato risponde «già approvato» senza prenotare; uno cambiato dopo la lettura è un conflitto (409)", async () => {
  const gia = ambiente(riga({ status: "approvato" }));
  const r = await gia.chiama("prepara_emissione", approva);
  assert.deepEqual([r.status, r.corpo], [200, { ok: true, gia_approvato: true }]);
  assert.deepEqual(gia.m.chiamate, []);
  const cambiato = ambiente();
  await assert.rejects(() => cambiato.chiama("prepara_emissione", { ...approva, attesa_updated_at: "2026-10-26T10:59:59+00:00" }), (e: unknown) => (e as { status?: number }).status === 409);
  assert.deepEqual(cambiato.m.chiamate, []);
});

Deno.test("Completa: il PDF disegnato dal browser sul modello del server viene conservato, e la risposta dice chi ha approvato", async () => {
  const { m, chiama } = ambiente();
  const prep = (await chiama("prepara_emissione", approva)).corpo as { html: string; layout: string; codice: string; revisione: number; emesso_il: string };
  // deno-lint-ignore no-explicit-any
  const pdf = await disegnaPdfPos(pdfMakeClient as any, { html: prep.html, codice: prep.codice, revisione: prep.revisione, emessoIl: prep.emesso_il, anteprima: false, layoutServer: prep.layout });
  const r = await chiama("completa_emissione", { emissione_id: id, token, pdf_sha256: await sha256Hex(pdf), html_sha256: await sha256Hex(strToU8(prep.html)), layout: prep.layout }, pdf);
  assert.deepEqual([r.status, r.corpo], [200, { ok: true, emissione_id: id, approvato_da_nome: "Mario Rossi" }]);
  assert.deepEqual(m.store.get(`${companyId}/${id}/${token}/POS.pdf`), pdf);
  assert.equal(m.riga.stato, "completa");
});

Deno.test("Completa: un altro utente, anche con il permesso, non può completare la prenotazione altrui (il nome di chi approva sta nell'HTML, l'impronta non torna)", async () => {
  const { m, chiama, tabelle } = ambiente();
  const prep = (await chiama("prepara_emissione", approva)).corpo as { html: string; layout: string; codice: string; revisione: number; emesso_il: string };
  // deno-lint-ignore no-explicit-any
  const pdf = await disegnaPdfPos(pdfMakeClient as any, { html: prep.html, codice: prep.codice, revisione: prep.revisione, emessoIl: prep.emesso_il, anteprima: false, layoutServer: prep.layout });
  const dichiarato = { emissione_id: id, token, pdf_sha256: await sha256Hex(pdf), html_sha256: await sha256Hex(strToU8(prep.html)), layout: prep.layout };
  tabelle.profiles = { first_name: "Anna", last_name: "Verdi", email: "a@x.it" };   // chi chiama adesso è un'altra persona dell'azienda
  await assert.rejects(() => chiama("completa_emissione", dichiarato, pdf), (e: unknown) => (e as { status?: number }).status === 409 && /Il POS è cambiato durante la preparazione/.test((e as Error).message));
  assert.equal(m.store.size, 0); assert.ok(!m.chiamate.includes("pos_completa_emissione"));   // niente conservato, nessun completamento
});

Deno.test("Completa: senza PDF è una richiesta sbagliata (400); con l'emissione di un'altra azienda non esiste (404) e non si tocca nulla", async () => {
  const { m, chiama } = ambiente();
  const dichiarato = { emissione_id: id, token, pdf_sha256: "a".repeat(64), html_sha256: "b".repeat(64), layout: "pos-pdf-10-design" };
  assert.equal((await chiama("completa_emissione", dichiarato)).status, 400);
  await assert.rejects(() => chiama("completa_emissione", dichiarato, new Uint8Array([1]), "99999999-9999-4999-8999-999999999999"), (e: unknown) => (e as { status?: number }).status === 404);
  assert.equal(m.store.size, 0); assert.equal(m.scritture.length, 0);
});

Deno.test("Annulla: libera la prenotazione di chi ha il token", async () => {
  const { m, chiama } = ambiente();
  const r = await chiama("annulla_emissione", { emissione_id: id, token });
  assert.deepEqual([r.status, r.corpo], [200, { ok: true }]);
  assert.equal(m.riga.stato, "errore");
});
