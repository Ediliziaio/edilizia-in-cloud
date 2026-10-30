// deno-lint-ignore-file require-await -- i finti restituiscono promesse come gli oggetti veri, senza aspettare niente
import assert from "node:assert/strict";
import { ErroreEmissionePos, type RigaEmissionePos } from "./posEmissione.ts";
import { sorgenteDaPrenotazione } from "./posSorgenti.ts";
import { posVuoto } from "./posModello.ts";

const companyId = "11111111-1111-4111-8111-111111111111", posId = "22222222-2222-4222-8222-222222222222", ordineId = "66666666-6666-4666-8666-666666666666";
const snapshotId = "77777777-7777-4777-8777-777777777777";
const prenotazione = (extra: Partial<RigaEmissionePos> = {}): RigaEmissionePos => ({ id: "33333333-3333-4333-8333-333333333333", company_id: companyId, pos_id: posId, revisione: 2,
  stato: "preparazione", token: "44444444-4444-4444-8444-444444444444", emesso_il: "2026-10-26T12:00:00+00:00", origine: "approvazione_corrente", snapshot_id: null,
  manifest: null, manifest_sha256: null, zip_sha256: null, sorgente_updated_at: "2026-10-26T11:00:00+00:00", ...extra });

/** Un database finto che registra i filtri di ogni lettura: le letture devono restare dentro l'azienda. */
function tabelle(righe: Record<string, Record<string, unknown> | null>) {
  const letture: Array<{ tabella: string; filtri: Array<[string, unknown]> }> = [];
  const db = { from: (tabella: string) => {
    const filtri: Array<[string, unknown]> = [];
    const q = { select: () => q, eq: (k: string, v: unknown) => { filtri.push([k, v]); return q; }, maybeSingle: async () => { letture.push({ tabella, filtri }); return { data: righe[tabella] ?? null, error: null }; } };
    return q;
  } };
  return { db, letture };
}
const posRiga = (extra: Record<string, unknown> = {}) => ({ id: posId, company_id: companyId, order_id: ordineId, status: "bozza", contenuto: posVuoto(), revisione: 2, revisioni: [{ rev: 2, data: "2026-10-25", descrizione: "Seconda" }], updated_at: "2026-10-26T11:00:00+00:00", document_type: "pos", ...extra });
const rilevaFonti = async (_db: unknown, azienda: string, ordine: string) => ({ order: { order_code: "ORD-77", company_id: azienda, id: ordine }, contenuto: posVuoto(), contesto: { mezzi: [], subappaltatori: [], avvisi: [] }, fonti: { origine: "test" } });

Deno.test("Sorgente: una prenotazione di approvazione riparte dal POS in bozza della sua azienda, con chi approva e le fonti rilevate", async () => {
  const { db, letture } = tabelle({ pos_documents: posRiga(), profiles: { first_name: "Mario", last_name: "Rossi", email: "m@x.it" } });
  const s = await sorgenteDaPrenotazione(db, { companyId, userId: "utente-1", e: prenotazione(), rilevaFonti });
  assert.equal(s.nomeAutore, "Mario Rossi"); assert.equal(s.posId, posId); assert.equal(s.snapshotId, undefined);
  assert.equal(s.dati.codiceCommessa, "ORD-77"); assert.equal(s.dati.revisione, 2); assert.equal(s.dati.stato, "approvato");
  assert.deepEqual(s.dati.revisioni, [{ rev: 2, data: "2026-10-25", descrizione: "Seconda" }]);
  const fonti = await s.fonti() as { tipo: string; commessa: { order_code: string } };
  assert.equal(fonti.tipo, "dati_app_rilevati_durante_preparazione"); assert.equal(fonti.commessa.order_code, "ORD-77");
  for (const l of letture.filter(x => x.tabella === "pos_documents")) assert.ok(l.filtri.some(([k, v]) => k === "company_id" && v === companyId));
});

Deno.test("Sorgente: se il profilo non ha nome si usa l'e-mail, e in mancanza di tutto «utente»", async () => {
  const a = tabelle({ pos_documents: posRiga(), profiles: { first_name: null, last_name: null, email: "m@x.it" } });
  assert.equal((await sorgenteDaPrenotazione(a.db, { companyId, userId: "u", e: prenotazione(), rilevaFonti })).nomeAutore, "m@x.it");
  const b = tabelle({ pos_documents: posRiga(), profiles: null });
  assert.equal((await sorgenteDaPrenotazione(b.db, { companyId, userId: "u", e: prenotazione(), rilevaFonti })).nomeAutore, "utente");
});

Deno.test("Sorgente: un POS che non è più una bozza, o che non esiste, non si approva", async () => {
  const gia = tabelle({ pos_documents: posRiga({ status: "approvato" }) });
  await assert.rejects(() => sorgenteDaPrenotazione(gia.db, { companyId, userId: "u", e: prenotazione(), rilevaFonti }), (e: unknown) => e instanceof ErroreEmissionePos && e.status === 409);
  const assente = tabelle({ pos_documents: null });
  await assert.rejects(() => sorgenteDaPrenotazione(assente.db, { companyId, userId: "u", e: prenotazione(), rilevaFonti }), (e: unknown) => e instanceof ErroreEmissionePos && e.status === 404);
});

Deno.test("Sorgente: una prenotazione da contenuto archiviato riparte da QUELLA copia, senza rileggere le fonti vive", async () => {
  const archivio = { id: snapshotId, revisione: 1, fonte: "approvazione", acquisito_il: "2026-10-01T10:00:00+00:00",
    snapshot: { status: "approvato", contenuto: posVuoto(), revisioni: [], approvato_da_nome: "Lucia Bianchi", approvato_il: "2026-10-01T09:00:00+00:00" } };
  const { db, letture } = tabelle({ pos_documents: posRiga({ status: "approvato" }), pos_contenuti_archiviati: archivio, orders: { order_code: "ORD-OLD" } });
  const e = prenotazione({ origine: "ricostruzione_da_contenuto_archiviato", snapshot_id: snapshotId, revisione: 1 });
  const s = await sorgenteDaPrenotazione(db, { companyId, userId: "u", e, rilevaFonti: async () => { throw new Error("non rileggere le fonti vive"); } });
  assert.equal(s.snapshotId, snapshotId); assert.equal(s.dati.codiceCommessa, "ORD-OLD"); assert.equal(s.dati.revisione, 1);
  assert.equal(s.dati.approvatoDa, "Lucia Bianchi"); assert.equal(s.nomeAutore, "Copia da contenuto archiviato");
  const l = letture.find(x => x.tabella === "pos_contenuti_archiviati")!;
  assert.ok(l.filtri.some(([k, v]) => k === "company_id" && v === companyId) && l.filtri.some(([k, v]) => k === "id" && v === snapshotId));
});

Deno.test("Sorgente: una copia da archivio che non esiste più non si prepara", async () => {
  const { db } = tabelle({ pos_documents: posRiga({ status: "approvato" }), pos_contenuti_archiviati: null });
  const e = prenotazione({ origine: "ricostruzione_da_contenuto_archiviato", snapshot_id: snapshotId });
  await assert.rejects(() => sorgenteDaPrenotazione(db, { companyId, userId: "u", e, rilevaFonti }), (x: unknown) => x instanceof ErroreEmissionePos && x.status === 404);
});

const conVersione = (aggiornato: string | null, prenotata: string | null) => ({
  ...tabelle({ pos_documents: posRiga({ updated_at: aggiornato }), profiles: { first_name: "Mario", last_name: "Rossi", email: "m@x.it" } }),
  e: prenotazione({ sorgente_updated_at: prenotata }),
});

Deno.test("Versione prenotata: lo stesso istante scritto in un altro formato è la stessa versione", async () => {
  for (const [aggiornato, prenotata] of [["2026-10-26T11:00:00+00:00", "2026-10-26T11:00:00+00:00"], ["2026-10-26T11:00:00.123456+00:00", "2026-10-26T11:00:00.123456Z"],
    ["2026-10-26 12:00:00.5+01", "2026-10-26T11:00:00.500000+00:00"], [null, null]] as Array<[string | null, string | null]>) {
    const c = conVersione(aggiornato, prenotata);
    const s = await sorgenteDaPrenotazione(c.db, { companyId, userId: "u", e: c.e, rilevaFonti });
    assert.equal(s.nomeAutore, "Mario Rossi", `${aggiornato} = ${prenotata}`);
  }
});

Deno.test("Versione prenotata: se il POS è cambiato dopo la prenotazione non si ricostruisce il modello dalla bozza corrente (nemmeno di un microsecondo)", async () => {
  for (const [aggiornato, prenotata] of [["2026-10-26T11:00:01+00:00", "2026-10-26T11:00:00+00:00"], ["2026-10-26T11:00:00.000001+00:00", "2026-10-26T11:00:00+00:00"],
    ["2026-10-26T11:00:00+00:00", null], [null, "2026-10-26T11:00:00+00:00"], ["non è una data", "2026-10-26T11:00:00+00:00"]] as Array<[string | null, string | null]>) {
    const c = conVersione(aggiornato, prenotata);
    await assert.rejects(() => sorgenteDaPrenotazione(c.db, { companyId, userId: "u", e: c.e, rilevaFonti: async () => { throw new Error("non rileggere le fonti: la versione è cambiata"); } }),
      (x: unknown) => x instanceof ErroreEmissionePos && x.status === 409 && /cambiato/.test(x.message), `${aggiornato} ≠ ${prenotata}`);
  }
});

Deno.test("Versione prenotata: una copia da contenuto archiviato non dipende dalla bozza (il contenuto archiviato non cambia)", async () => {
  const archivio = { id: snapshotId, revisione: 1, fonte: "approvazione", acquisito_il: "2026-10-01T10:00:00+00:00",
    snapshot: { status: "approvato", contenuto: posVuoto(), revisioni: [], approvato_da_nome: "Lucia Bianchi", approvato_il: "2026-10-01T09:00:00+00:00" } };
  const { db } = tabelle({ pos_documents: posRiga({ status: "approvato", updated_at: "2027-01-01T00:00:00+00:00" }), pos_contenuti_archiviati: archivio, orders: { order_code: "ORD-OLD" } });
  const e = prenotazione({ origine: "ricostruzione_da_contenuto_archiviato", snapshot_id: snapshotId, revisione: 1, sorgente_updated_at: "2026-10-26T11:00:00+00:00" });
  const s = await sorgenteDaPrenotazione(db, { companyId, userId: "u", e, rilevaFonti });
  assert.equal(s.dati.codiceCommessa, "ORD-OLD");
});
