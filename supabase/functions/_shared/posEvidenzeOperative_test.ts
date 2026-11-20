import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { leggiPaginePscConOcr } from "./posAiFonti.ts";
import { applicaFontiProposteAiPos, preparaContestoAiPos } from "./posAiContesto.ts";
import { pacchettoEmissionePos, raccogliFontiEmissione, type RigaEmissionePos } from "./posEmissione.ts";
import { CAMPI_EMERGENZE_POS, riscontriDpiDisponibili, dataRiscontriDpiPos, type AddettoConConsegne } from "./posEvidenzeOperative.ts";
import { originaleRapportoRumorePos } from "./posFontiOperative.ts";
import { normalizzaPos, posVuoto, vociMancanti } from "./posModello.ts";
import type { RiferimentoPsc } from "./posPsc.ts";
import { sha256Hex } from "./improntaDocumento.ts";

const company = "11111111-1111-4111-8111-111111111111", posId = "22222222-2222-4222-8222-222222222222";
const ordine = "33333333-3333-4333-8333-333333333333", rapportoId = "44444444-4444-4444-8444-444444444444";
const id = "55555555-5555-4555-8555-555555555555", token = "66666666-6666-4666-8666-666666666666";
const fase = "77777777-7777-4777-8777-777777777777";
const originale = new TextEncoder().encode("Rapporto del rumore simulato");
const ora = "2026-11-20T12:00:00Z";
const addetti: AddettoConConsegne[] = [{
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Elena", cognome: "Bianchi", attivo: true,
  assegnazioni: [{ fase_id: fase }],
  consegne: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tipo: "tappi_auricolari",
    consegnato_il: "2026-09-08", scade_il: null, restituito_il: null, stato: "in_use", versione: 3 }],
}];

function archivio() {
  const record = { order_id: ordine, titolo: "Rapporto RUM-22", file_path: `${company}/documenti/${ordine}/rumore.pdf`,
    file_name: "rumore.pdf", data_documento: "2026-10-28" };
  const filtri: unknown[][] = [];
  let byte = originale;
  let letture = 0;
  const db = {
    from: (tabella: string) => {
      const q = {
        select: () => q,
        eq: (k: string, v: string) => { filtri.push([k, v]); return q; },
        is: (k: string, v: null) => { filtri.push([k, v]); return q; },
        maybeSingle: () => Promise.resolve({ data: tabella === "sicurezza_documenti" ? record : { order_id: ordine } }),
      };
      return q;
    },
    storage: { from: (bucket: string) => ({
      download: (path: string) => {
        assert.equal(bucket, "sicurezza-documenti");
        assert.equal(path, record.file_path);
        letture++;
        return Promise.resolve({ data: new Blob([new Uint8Array(byte).buffer]) });
      },
    }) },
  };
  return { db, record, filtri, letture: () => letture, sostituisci: () => { byte = new Uint8Array([8, 1]); } };
}

Deno.test("Esiti del rumore e procedura di emergenza conservano i riferimenti e richiedono il riesame", () => {
  const p = posVuoto();
  p.versione_evidenze_operative = 1;
  p.rumore = { esito: "Rapporto RUM-22", rapporto: { codice: "RUM-22", data: "2026-11-31", revisione: "2" },
    righe: [{ mansione: "Posatore", lavorazione: "Posa", esposizione: "79 dB(A)", livello_sorgenti: "", note: "" }] };
  assert.equal(vociMancanti(p).filter(v => v.sezione === "rumore").length, 3);
  assert.ok(vociMancanti(p).some(v => v.sezione === "emergenze" && /Accesso dei soccorsi/.test(v.testo)));
  Object.assign(p.rumore.rapporto!, { data: "2026-10-28", collocazione: "Ufficio sicurezza, raccoglitore 11", esiti_riesaminati: true });
  p.rumore.righe[0].riferimento = "Pagina 7, riga 9";
  p.emergenze.piano = Object.fromEntries(Object.keys(CAMPI_EMERGENZE_POS).map(k => [k, "Indicazione verificata in cantiere"]));
  const salvato = normalizzaPos(JSON.parse(JSON.stringify(p)));
  assert.equal(vociMancanti(salvato).filter(v => v.sezione === "rumore" || v.riferimento === "Controllo operativo").length, 0);
  assert.equal(salvato.rumore.righe[0].riferimento, "Pagina 7, riga 9");
});

Deno.test("Un rapporto di altra commessa o in un percorso di subappalto non viene aperto", async () => {
  const { db, record, letture, filtri } = archivio();
  const rif = { origine: "archivio" as const, id: rapportoId };
  record.order_id = posId;
  await assert.rejects(() => originaleRapportoRumorePos(db, company, ordine, posId, posVuoto(), rif), /non disponibile per questa commessa/);
  record.order_id = ordine;
  record.file_path = `${company}/subappaltatore/rumore.pdf`;
  await assert.rejects(() => originaleRapportoRumorePos(db, company, ordine, posId, posVuoto(), rif), /estraneo all’archivio/);
  assert.equal(letture(), 0);
  assert.deepEqual(filtri.slice(0, 4), [["company_id", company], ["id", rapportoId], ["tipo", "valutazione_rumore"], ["subappaltatore_id", null]]);
});

Deno.test("Registro DPI: data, stato, assegnazione e versione controllano la selezione", () => {
  const candidati = (elenco: AddettoConConsegne[], f = fase) => riscontriDpiDisponibili(elenco, "Ot protettori", "2026-11-20", f);
  assert.equal(candidati(addetti).length, 1);
  assert.equal(candidati(addetti, "altra fase").length, 0);
  for (const modifica of [{ annullata: true }, { stato: "lost" }, { scade_il: "2026-10-01" }, { consegnato_il: "2027-01-01" }, { restituito_il: "2026-11-01" }]) {
    assert.equal(candidati([{ ...addetti[0], consegne: [{ ...addetti[0].consegne[0], ...modifica }] }]).length, 0);
  }
});

Deno.test("Fascicolo: congela rapporto e consegne, blocca nuove versioni o revoche prima dell’emissione", async () => {
  const a = archivio();
  const d = esempioPdfPos();
  d.contenuto.allegati = [];
  d.contenuto.emergenze.piano = { raccolta: "Cancello est", accesso_soccorsi: "Accesso da via Roma" };
  const r = await originaleRapportoRumorePos(a.db, company, ordine, posId, d.contenuto, { origine: "archivio", id: rapportoId });
  d.contenuto.rumore.rapporto = { codice: "RUM-22", data: "2026-10-28", revisione: "02", fonte: r.fonte, esiti_riesaminati: true };
  const l = d.contenuto.lavorazioni[0];
  l.fase_id = fase;
  l.dpi = "Tappi auricolari";
  l.riscontri_dpi = riscontriDpiDisponibili(addetti, l.dpi, dataRiscontriDpiPos(), fase);
  assert.equal(l.riscontri_dpi.length, 1);
  const e: RigaEmissionePos = { id, company_id: company, pos_id: posId, revisione: 0, stato: "preparazione", token,
    emesso_il: ora, origine: "approvazione_corrente", snapshot_id: null, manifest: null, manifest_sha256: null, zip_sha256: null };
  const s = { dati: d, companyId: company, posId, attesoUpdatedAt: null, nomeAutore: "Approvazione DEMO",
    fonti: () => Promise.resolve({ prova: "simulazione" }),
    leggiConsegne: (o: string) => { assert.equal(o, ordine); return Promise.resolve(addetti); } };
  const fonti = await raccogliFontiEmissione(a.db, "autore", e, s, d);
  const p = await pacchettoEmissionePos(a.db, e, s, d, fonti);
  const f = p.manifest.file.filter(f => f.tipo === "valutazione_rumore");
  assert.equal(f.length, 1);
  assert.equal(f[0].sha256, await sha256Hex(originale));
  const html = new TextDecoder().decode(p.oggetti.find(o => o.path.endsWith("modello.html"))!.bytes);
  for (const valore of ["Accesso da via Roma", "Cancello est", "RUM-22", "Elena Bianchi", "Tappi auricolari", "Consegne DPI collegate al registro"]) assert.ok(html.includes(valore), valore);
  const prova = new TextDecoder().decode(p.oggetti.find(o => o.path.endsWith("fonti.json"))!.bytes);
  assert.match(prova, /consegne_dpi/);
  assert.match(prova, /rapporto_rumore/);
  const mutate = [{ ...addetti[0], consegne: [{ ...addetti[0].consegne[0], versione: 4 }] }];
  await assert.rejects(() => raccogliFontiEmissione(a.db, "autore", e, { ...s, leggiConsegne: () => Promise.resolve(mutate) }, d), /collegamento DPI.*cambiato/);
  a.sostituisci();
  await assert.rejects(() => raccogliFontiEmissione(a.db, "autore", e, s, d), /rapporto del rumore è cambiato/);
});

Deno.test("PSC misto: OCR riceve una sola pagina, conserva pagina e richiede il confronto prima della procedura", async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Pagina nativa");
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZeUAAAAASUVORK5CYII="), c => c.charCodeAt(0));
  const immagine = await doc.embedPng(png);
  for (let i = 0; i < 5; i++) doc.addPage([600, 800]).drawImage(immagine, { x: 20, y: 60, width: 550, height: 680 });
  const bytes = await doc.save();
  const impronta = await sha256Hex(bytes);
  const testo = "Tenere separati i percorsi durante la posa dei serramenti.";
  const chiamate: number[] = [];
  const leggi = leggiPaginePscConOcr(3, async (pagina, singola, hash) => {
    assert.equal((await PDFDocument.load(singola)).getPageCount(), 1);
    assert.equal(hash, impronta);
    chiamate.push(pagina);
    return { text: testo, finishReason: pagina === 5 ? "length" : "stop" };
  });
  const letti = await leggi(bytes, 70, 125_000, impronta);
  assert.deepEqual(chiamate, [3, 4, 5, 6]);
  assert.deepEqual(letti.illeggibili, [2, 5]);
  assert.equal(letti.pagine.find(p => p.pagina === 4)?.metodo, "ocr");
  const riferimento: RiferimentoPsc = { id: rapportoId, company_id: company, order_id: ordine, archivio: "sicurezza_documenti",
    titolo: "Piano dimostrativo", file_path: `${company}/documenti/${ordine}/psc.pdf`, file_name: "psc.pdf",
    data_documento: "2026-10-22", revisione: "02", sha256: impronta };
  const p = posVuoto();
  p.procedure_psc = { psc_presente: true, richieste: true, documento: riferimento, voci: [] };
  const fonte = preparaContestoAiPos({ descrizione: "", fasi: [], ambito: "Serramenti", computo: null,
    limitaAlPerimetro: false, psc: { riferimento, pagine: letti.pagine } });
  const [l] = applicaFontiProposteAiPos([{ titolo: "Posa serramenti", riferimenti_psc: [
    { pagina: 4, testo, confermato: true }, { pagina: 5, testo },
  ] }], "demo", fonte, { perimetroEsplicito: false, inSubappalto: false, subappaltatori: [] });
  const psc = l.fonti_scheda?.psc;
  assert.deepEqual(psc?.estratti, [{ pagina: 4, testo, metodo: "ocr", confermato: false }]);
  p.lavorazioni = [l];
  p.procedure_psc.voci = [{ procedura: testo, indicazioni: "Percorsi riportati in planimetria", pagina: "4", lavorazione_id: l.id,
    fonte_estratto: { id: riferimento.id, revisione: "02", sha256: impronta, metodo: "ocr" } }];
  assert.ok(vociMancanti(p).some(v => /ricollega un estratto OCR/.test(v.testo)));
  psc!.estratti[0].confermato = true;
  assert.ok(!vociMancanti(normalizzaPos(p)).some(v => /ricollega un estratto OCR/.test(v.testo)));
  p.procedure_psc.voci[0].procedura += " Alterazione.";
  assert.ok(vociMancanti(p).some(v => /ricollega un estratto OCR/.test(v.testo)));
});
