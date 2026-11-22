import { estraiPagineTestoPdf, extractPdfWithCoverage } from "./pdfExtraction.ts";
import { leggiComputoPerPos, type ComputoPerPos } from "./posComputo.ts";
export type { ComputoPerPos } from "./posComputo.ts";
import { improntaPsc, LIMITE_PSC_BYTES, normalizzaRiferimentoPsc, stessaFontePsc, type RiferimentoPsc } from "./posPsc.ts";
import { erroreAiPerUtente } from "./erroriAi.ts";
import { verificaFontePsc } from "./posPscFonte.ts";

export type PscPerPos = { riferimento: RiferimentoPsc; letturaIntegrale?: boolean; pagine: { pagina: number; testo: string; metodo?: "ocr" }[] };
export type FasePerPos = { id: string; name: string };
export type FontePropostaPos<T> = { fonte: T | null; avviso?: string };

// The caller has already checked the company, POS write permission and order ownership.
// deno-lint-ignore no-explicit-any
type Db = any;

export async function fasiPerAiPos(db: Db, companyId: string, orderId: string): Promise<FasePerPos[]> {
  const { data, error } = await db.from("order_work_phases").select("id,name").eq("company_id", companyId)
    .eq("order_id", orderId).order("position");
  if (error) throw new Error("Fasi della commessa non disponibili.");
  return ((data ?? []) as FasePerPos[]).filter(f => f.name.trim());
}

export async function computoPerAiPos(db: Db, companyId: string, orderId: string, userId: string): Promise<FontePropostaPos<ComputoPerPos>> {
  const { data: permesso, error: errorePermesso } = await db.rpc("has_permission_for_company", {
    _user_id: userId, _permission: "can_view_orders", _company_id: companyId,
  });
  if (errorePermesso || permesso !== true) return { fonte: null, avviso: "Computo escluso dalla proposta: accesso alla commessa non verificato." };
  const { fonte, avviso } = await leggiComputoPerPos(db, companyId, orderId);
  return { fonte, ...(avviso ? { avviso } : {}) };
}

type LeggiPaginePsc = (bytes: Uint8Array, maxPages: number, maxChars: number, impronta: string) =>
  Promise<Omit<Awaited<ReturnType<typeof estraiPagineTestoPdf>>, "pagine"> & {
    pagine: PscPerPos["pagine"]; troncato?: boolean; ocr?: { pagine: number[]; da: number };
  }>;

export function leggiPaginePscConOcr(prima: number, ocr: (pagina: number, bytes: Uint8Array, impronta: string) =>
  Promise<{ text: string; finishReason?: string }>): LeggiPaginePsc {
  const pagineOcr = Array.from({ length: 4 }, (_, i) => prima + i);
  return async (bytes, maxPages, maxChars, impronta) => {
    const lettura = await extractPdfWithCoverage(new Uint8Array(bytes).buffer, {
      maxPages, maxChars, maxOcrPages: pagineOcr.length, pagineOcr, deadlineMs: 40_000,
      ocrPage: (pagina, contenuto) => ocr(pagina, contenuto, impronta),
    });
    const selezionate = [...lettura.pages].sort((a, b) => Number(b.method === "ocr") - Number(a.method === "ocr") || a.page - b.page);
    const pagine: PscPerPos["pagine"] = [];
    let disponibili = maxChars;
    for (const r of selezionate) {
      if ((r.method !== "native" && r.method !== "ocr") || !r.text.trim() || disponibili <= 0) continue;
      const testo = r.text.slice(0, disponibili);
      pagine.push({ pagina: r.page, testo, ...(r.method === "ocr" ? { metodo: "ocr" as const } : {}) });
      disponibili -= testo.length;
    }
    const { pages_unreadable, pages_inspected, pages_total, pages_ocr } = lettura.coverage;
    return { pagine, illeggibili: pages_unreadable, ispezionate: pages_inspected, totale: pages_total,
      ocr: { pagine: pages_ocr, da: prima }, troncato: disponibili === 0 };
  };
}

export async function riferimentoPscCorrente(db: Db, companyId: string, orderId: string, selezionato?: RiferimentoPsc): Promise<FontePropostaPos<RiferimentoPsc>> {
  const { data: avvio, error } = await db.from("sicurezza_avvio_commessa").select("stato,psc")
    .eq("company_id", companyId).eq("order_id", orderId).maybeSingle();
  if (error) return { fonte: null, avviso: "PSC temporaneamente non verificabile in Avvio sicurezza." };
  if (avvio?.stato === "non_previsto") return { fonte: null };
  if (avvio?.stato !== "previsto") return { fonte: null, avviso: "Conferma l’applicabilità del PSC in Avvio sicurezza." };
  const corrente = normalizzaRiferimentoPsc(avvio.psc);
  if (!corrente) return { fonte: null, avviso: "Collega il PSC vigente in Avvio sicurezza per estrarne le prescrizioni." };
  if (!selezionato || !stessaFontePsc(corrente, { ...selezionato, created_at: "" }) || corrente.sha256 !== selezionato.sha256) {
    return { fonte: null, avviso: "Allinea il riferimento del POS al PSC vigente per estrarne le prescrizioni." };
  }
  return { fonte: corrente };
}

export async function scaricaPscPerAnalisi(db: Db, corrente: RiferimentoPsc): Promise<Uint8Array<ArrayBuffer>> {
  await verificaFontePsc(db, corrente.company_id, corrente.order_id, corrente);
  const bucket = corrente.archivio === "sicurezza_documenti" ? "sicurezza-documenti" : "fascicoli-cantiere";
  const { data, error } = await db.storage.from(bucket).download(corrente.file_path);
  if (error || !data || !data.size || data.size > LIMITE_PSC_BYTES) throw new Error("Originale PSC assente o superiore a 20 MB.");
  const buffer = await data.arrayBuffer();
  if (await improntaPsc(new Blob([buffer])) !== corrente.sha256) throw new Error("L’originale PSC è cambiato. Ricollega il documento in Avvio sicurezza.");
  return new Uint8Array(buffer);
}

export async function pscPerAiPos(db: Db, companyId: string, orderId: string, selezionato?: RiferimentoPsc,
  leggiPagine: LeggiPaginePsc = estraiPagineTestoPdf): Promise<FontePropostaPos<PscPerPos>> {
  const rif = await riferimentoPscCorrente(db, companyId, orderId, selezionato);
  const corrente = rif.fonte;
  if (!corrente) return { fonte: null, ...(rif.avviso ? { avviso: rif.avviso } : {}) };
  try {
    const bytes = await scaricaPscPerAnalisi(db, corrente);
    const lettura = await leggiPagine(bytes, 70, 125_000, corrente.sha256);
    const limiti = [
      lettura.illeggibili.length ? `Testo PSC non leggibile alle pagine ${lettura.illeggibili.slice(0, 12).join(", ")}${lettura.illeggibili.length > 12 ? " e altre" : ""}.` : "",
      lettura.ispezionate < lettura.totale ? `Pagine esaminate: ${lettura.ispezionate} di ${lettura.totale}.` : "",
      lettura.ocr?.pagine.length ? `OCR eseguito alle pagine ${lettura.ocr.pagine.join(", ")}. Confronta gli estratti con l’originale.` : "",
      lettura.ocr && lettura.ocr.da > lettura.totale ? `Il PSC ha ${lettura.totale} pagine. Scegli una pagina iniziale disponibile.` : "",
      lettura.troncato ? "Lettura parziale per dimensione del testo. Consulta sempre anche l’originale." : "",
    ].filter(Boolean);
    if (!lettura.pagine.length) return { fonte: null, avviso: ["Nessuna pagina leggibile in questa elaborazione del PSC.", ...limiti,
      "Scegli le pagine da leggere con OCR o riporta le prescrizioni nella sezione PSC."].join(" ") };
    return { fonte: { riferimento: corrente, pagine: lettura.pagine }, ...(limiti.length ? { avviso: limiti.join(" ") } : {}) };
  } catch (errore) {
    const ai = erroreAiPerUtente(errore);
    const messaggio = ai && typeof ai.body.error === "string" ? ai.body.error : null;
    return { fonte: null, avviso: messaggio ?? (errore instanceof Error && /PSC/.test(errore.message) ? errore.message : null) ?? "Lettura del PSC non riuscita. Controlla il PDF e riporta le prescrizioni nella sezione PSC." };
  }
}
