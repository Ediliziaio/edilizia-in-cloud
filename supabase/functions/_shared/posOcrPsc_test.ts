import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { giroOcrPsc } from "./posOcrPsc.ts";
import { improntaPsc, type RiferimentoPsc } from "./posPsc.ts";

const company = "11111111-1111-4111-8111-111111111111";
const order = "22222222-2222-4222-8222-222222222222";
const docId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";

Deno.test("OCR PSC in background: conserva il progresso e riprende dopo un guasto senza segnare le pagine illeggibili", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Organizzazione e sicurezza");
  const pixel = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZeUAAAAASUVORK5CYII="), c => c.charCodeAt(0));
  const image = await pdf.embedPng(pixel);
  pdf.addPage([600, 800]).drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  for (let i = 2; i < 9; i++) pdf.addPage();
  pdf.addPage([600, 800]).drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  const bytes = await pdf.save();
  const file = new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
  const fonte: RiferimentoPsc = { archivio: "sicurezza_documenti", id: docId, company_id: company, order_id: order, titolo: "PSC",
    file_name: "psc.pdf", file_path: `${company}/documenti/${order}/psc.pdf`, data_documento: "2026-11-20", revisione: "01", sha256: await improntaPsc(file) };
  const pagine: { pagina: number; metodo: string; testo: string }[] = [];
  const errori: string[] = [];
  const lavoro = { id: jobId, stato: "in_lettura", company_id: company, order_id: order, documento_id: docId, revisione: fonte.revisione, sha256: fonte.sha256,
    richiesto_da: "autore", pagine_totali: null as number | null, token: "token", ciclo_riprova: 0 };
  const db = {
    from(tabella: string) {
      const query = {
        select: () => query, eq: () => query, is: () => query, order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (tabella === "sicurezza_avvio_commessa") return { data: { stato: "previsto", psc: fonte } };
          if (tabella === "sicurezza_documenti") return { data: fonte };
          return { data: pagine.at(-1) ?? null };
        },
        then: (resolve: (r: { data: unknown[] }) => void) => resolve({ data: [] }),
      };
      return query;
    },
    storage: { from: () => ({ download: async () => ({ data: file }) }) },
    async rpc(nome: string, args: { _id: string; _totali: number; _pagine: typeof pagine; _errore: string | null }) {
      if (nome === "pos_ocr_prendi") return { data: [lavoro] };
      assert.equal(nome, "pos_ocr_salva");
      if (args._errore) {
        assert.deepEqual(args._pagine, []);
        errori.push(args._errore);
        return { data: "errore" };
      }
      assert.ok(args._pagine.length > 0, "pos_ocr_salva rifiuta un lotto vuoto");
      lavoro.pagine_totali = args._totali;
      pagine.push(...args._pagine);
      return { data: pagine.length === 10 ? "pronta" : "in_coda" };
    },
  };
  const keys = ["POS_OCR_SERVIZIO_URL", "POS_OCR_SERVIZIO_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const precedenti = keys.map(k => Deno.env.get(k));
  const fetchOriginale = globalThis.fetch;
  let inviati = 0, prosegui = 0;
  try {
    ["https://ocr.example/ocr", "token-demo", "https://edge.example", "service-demo"].forEach((v, i) => Deno.env.set(keys[i], v));
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://ocr.example")) {
        inviati++;
        const singolo = await PDFDocument.load(init?.body as Uint8Array);
        assert.equal(singolo.getPageCount(), 1);
        if (inviati === 1 || inviati === 3) return new Response(null, { status: 503 });
        if (inviati === 2) return new Response("Gateway in aggiornamento");
        if (inviati === 5) return new Response(null, { status: 401 });
        return Response.json({ testo: "Raggiungere il punto di raccolta dal cancello est.", completa: true });
      }
      assert.equal(url, "https://edge.example/functions/v1/genera-pos");
      assert.deepEqual(JSON.parse(String(init?.body)), { azione: "psc_ocr_giro", lettura_id: jobId });
      prosegui++;
      return new Response(null, { status: 202 });
    };
    const permesso = async (utente: string, azienda: string) => {
      assert.equal(utente, "autore"); assert.equal(azienda, company);
    };
    await giroOcrPsc(db, jobId, permesso);
    assert.deepEqual(pagine.map(p => p.pagina), [1]);
    assert.equal(pagine[0].metodo, "native");
    assert.equal(prosegui, 1);
    await giroOcrPsc(db, jobId, permesso);
    await giroOcrPsc(db, jobId, permesso);
    assert.deepEqual(pagine.map(p => p.pagina), [1]);
    assert.equal(prosegui, 1, "Il cron riprende i giri interrotti senza risultati");
    await giroOcrPsc(db, jobId, permesso);
    assert.deepEqual(pagine.map(p => p.pagina), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(pagine[1].metodo, "ocr");
    assert.equal(pagine[2].metodo, "blank");
    await giroOcrPsc(db, jobId, permesso);
    assert.equal(pagine.length, 9);
    assert.match(errori[0], /servizio OCR privato non è configurato/);
    await giroOcrPsc(db, jobId, permesso);
    assert.deepEqual(pagine.map(p => p.pagina), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(inviati, 6);
    assert.equal(prosegui, 2);
    assert.equal(await improntaPsc(file), fonte.sha256);
  } finally {
    globalThis.fetch = fetchOriginale;
    keys.forEach((k, i) => precedenti[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, precedenti[i]!));
  }
});
