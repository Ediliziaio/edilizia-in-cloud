import type { AZIONI_BROWSER_POS } from "./posAzioni.ts";
import { controlliApprovazione, erroreRispostaPos, rispostaPos, type RispostaPos } from "./posApprovazione.ts";
import type { preparaPosDaApp } from "./posDatiApp.ts";
// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type PosRiga = any;

/**
 * Le azioni di genera-pos in cui il PDF lo disegna il browser (il server ha 2 s di CPU per richiesta, e disegnare un POS
 * con pdfmake ne chiede da 0,5 a oltre 2): l'HTML dell'anteprima, e le tre fasi di un'emissione. Il gestore (index.ts)
 * ha già controllato accesso e permessi; qui si risponde con {status, corpo} e gli errori col loro stato partono come eccezioni.
 *
 *   completa_emissione  meta: emissione_id, token, pdf_sha256, html_sha256, layout  +  il file «pdf»
 *   annulla_emissione   meta: emissione_id, token
 *   prepara_emissione   pos_id (+ attesa_updated_at, oppure snapshot_id per la copia di un contenuto archiviato)
 *   anteprima_html      pos_id
 *
 * Data e ora di emissione, CreationDate del PDF e data di approvazione stampata arrivano dal server (emesso_il, anteprima:
 * l'ora del server): il browser non ci mette il suo orologio.
 */
export interface ContestoAzioneBrowser {
  azione: (typeof AZIONI_BROWSER_POS)[number];
  db: Db; userId: string; companyId: string;
  // deno-lint-ignore no-explicit-any
  body: Record<string, any>;
  pdf?: Uint8Array;
  /** Legge il POS dell'azienda (il gestore sa già rispondere con 404 e con gli errori del database). */
  caricaPos: (posId: string) => Promise<PosRiga>;
  /** Per le prove: dove si rilevano i dati dell'app (di solito preparaPosDaApp). */
  rilevaFonti?: typeof preparaPosDaApp;
}

const testo = (v: unknown) => String(v || "");

export async function gestisciAzioneBrowserPos(c: ContestoAzioneBrowser): Promise<RispostaPos> {
  const { azione, db, userId, companyId, body } = c;

  if (azione === "completa_emissione") {
    if (!c.pdf) return erroreRispostaPos("Manca il PDF da conservare", 400);
    const { completaEmissioneBrowser } = await import("./posEmissioneBrowser.ts");
    const { sorgenteDaPrenotazione } = await import("./posSorgenti.ts");
    let nome: string | undefined;
    const r = await completaEmissioneBrowser(db, userId, { companyId, emissioneId: testo(body.emissione_id), token: testo(body.token), pdf: c.pdf,
      dichiarato: { pdfSha256: testo(body.pdf_sha256), htmlSha256: testo(body.html_sha256), layout: testo(body.layout) },
      sorgente: async e => { const s = await sorgenteDaPrenotazione(db, { companyId, userId, e, rilevaFonti: c.rilevaFonti }); nome = s.nomeAutore; return s; } });
    return rispostaPos(200, { ok: true, emissione_id: r.id, ...(nome ? { approvato_da_nome: nome } : {}) });
  }

  if (azione === "annulla_emissione") {
    const { annullaEmissioneBrowser } = await import("./posEmissioneBrowser.ts");
    await annullaEmissioneBrowser(db, companyId, testo(body.emissione_id), testo(body.token));
    return rispostaPos(200, { ok: true });
  }

  const posId = testo(body.pos_id);
  if (!posId) return erroreRispostaPos("pos_id obbligatorio", 400);
  const pos = await c.caricaPos(posId);

  if (azione === "anteprima_html") {
    const { data: ordine, error } = await db.from("orders").select("order_code").eq("company_id", companyId).eq("id", pos.order_id).maybeSingle();
    if (error) return erroreRispostaPos("Codice commessa non disponibile", 503);
    const { anteprimaHtmlPos } = await import("./posEmissioneBrowser.ts");
    const { datiDaSnapshotPos } = await import("./posEmissione.ts");
    return rispostaPos(200, { ok: true, ...anteprimaHtmlPos(datiDaSnapshotPos(pos, pos.revisione ?? 0, ordine?.order_code || ""), new Date().toISOString()) });
  }

  // prepara_emissione
  const { preparaEmissioneBrowser } = await import("./posEmissioneBrowser.ts");
  const { sorgenteApprovazione, sorgenteArchivio, nomeDiChiApprova } = await import("./posSorgenti.ts");
  let sorgente;
  if (typeof body.snapshot_id === "string" && body.snapshot_id) {
    // Una copia del contenuto già approvato e archiviato: la stessa strada di «emetti».
    sorgente = await sorgenteArchivio(db, { companyId, pos, snapshotId: body.snapshot_id });
  } else {
    const verificato = controlliApprovazione(pos, body);
    if (verificato.tipo === "risposta") return verificato;
    sorgente = await sorgenteApprovazione(db, { companyId, pos, nomeAutore: await nomeDiChiApprova(db, userId), rilevaFonti: c.rilevaFonti });
  }
  const p = await preparaEmissioneBrowser(db, userId, sorgente);
  if (p.giaCompleta) return rispostaPos(200, { ok: true, gia_completa: true, emissione_id: p.emissione.id });
  return rispostaPos(200, { ok: true, emissione_id: p.emissioneId, token: p.token, emesso_il: p.emessoIl, html: p.html, layout: p.layout, codice: p.codice, revisione: p.revisione });
}
