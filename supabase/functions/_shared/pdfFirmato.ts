/**
 * Il PDF firmato di una richiesta di firma elettronica (FEA).
 *
 * Fino al 05/10/2026 «firmato» era solo una riga nel database: il PDF restava
 * quello inviato, senza traccia di chi l'aveva firmato né di quando. Ora, a
 * firma completata:
 *  - se il documento è un PDF, ogni pagina porta in basso il timbro «Firmato
 *    elettronicamente da … il … · codice …· pag. x/N»;
 *  - in coda c'è la pagina del certificato di firma: chi, quando, da dove,
 *    come è stato verificato (codice monouso via email), l'impronta SHA-256
 *    del documento, le clausole approvate a parte (art. 1341 c.c.) e il codice
 *    di verifica;
 *  - se il documento non è un PDF (il preventivo fotovoltaico è una pagina HTML)
 *    resta il solo certificato, con l'impronta del documento.
 * Il file sta in `quote-pdfs/<azienda>/firmati/<richiesta>.pdf`.
 *
 * `assicuraPdfFirmato` è idempotente: se il file c'è già lo restituisce.
 */
import { clausoleDellaFirma } from "./clausoleFirma.ts";
import { mascheraTelefono } from "./telefonoE164.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

const BUCKET = "quote-pdfs";
const MAX_ORIGINALE = 25 * 1024 * 1024;

export interface PdfFirmatoEsito {
  path: string;
  codiceVerifica: string;
  hash: string;
  creato: boolean;
}

export interface DatiCertificato {
  azienda: string;
  documento: string;
  firmatario: string;
  email: string;
  tipoFirmatario: string;
  firmatoIl: string;
  ip: string | null;
  userAgent: string | null;
  hashDocumento: string | null;
  richiestaId: string;
  codiceVerifica: string;
  clausole: string[];
  recessoAccettato: boolean;
  conTimbro: boolean;
  impronteDiverse: boolean;
  /** Il codice è arrivato anche via SMS a questo numero (già mascherato). */
  telefonoSms?: string | null;
}

/** pdf-lib con i font standard scrive solo WinAnsi: tutto il resto diventa un carattere sicuro. */
export function perPdf(testo: unknown): string {
  return String(testo ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[−–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^ -~¡-ÿ€]/gu, "?");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Codice breve che lega richiesta, documento e istante di firma: XXXX-XXXX-XXXX. */
export async function codiceDiVerifica(richiestaId: string, hashDocumento: string | null, firmatoIl: string): Promise<string> {
  const h = await sha256Hex(new TextEncoder().encode(`${richiestaId}|${hashDocumento ?? ""}|${firmatoIl}`));
  const c = h.slice(0, 12).toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

export function dataItaliana(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(iso));
}

/** Va a capo per larghezza (in punti) con il font dato. */
export function aCapo(testo: string, font: PDFFont, size: number, larghezza: number): string[] {
  const righe: string[] = [];
  let corrente = "";
  for (const parola of perPdf(testo).split(" ")) {
    const prova = corrente ? `${corrente} ${parola}` : parola;
    if (corrente && font.widthOfTextAtSize(prova, size) > larghezza) {
      righe.push(corrente);
      corrente = parola;
    } else {
      corrente = prova;
    }
  }
  if (corrente) righe.push(corrente);
  return righe;
}

/** Timbro in basso su ogni pagina del documento originale. */
function timbra(pagine: PDFPage[], font: PDFFont, d: DatiCertificato) {
  const totale = pagine.length;
  pagine.forEach((p, i) => {
    const { width } = p.getSize();
    const riga = perPdf(`Firmato elettronicamente da ${d.firmatario} il ${d.firmatoIl} - Cod. verifica ${d.codiceVerifica} - pag. ${i + 1}/${totale}`);
    const size = 6.5;
    const w = font.widthOfTextAtSize(riga, size);
    const x = Math.max(8, (width - w) / 2);
    p.drawRectangle({ x: x - 4, y: 5, width: Math.min(w + 8, width - 8), height: 11, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawText(riga, { x, y: 8, size, font, color: rgb(0.25, 0.25, 0.3) });
  });
}

/** Pagina finale: il certificato di firma. */
function aggiungiCertificato(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, d: DatiCertificato) {
  const M = 48;
  let page = pdf.addPage([595.28, 841.89]);
  let y = 841.89 - M;
  const W = 595.28 - M * 2;

  const nuovaPagina = () => { page = pdf.addPage([595.28, 841.89]); y = 841.89 - M; };
  const spazio = (h: number) => { if (y - h < M) nuovaPagina(); };
  const testo = (t: string, o: { size?: number; font?: PDFFont; colore?: [number, number, number]; rientro?: number; dopo?: number } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const rientro = o.rientro ?? 0;
    for (const r of aCapo(t, font, size, W - rientro)) {
      spazio(size + 3);
      page.drawText(r, { x: M + rientro, y: y - size, size, font, color: rgb(...(o.colore ?? [0.1, 0.1, 0.15])) });
      y -= size + 3.5;
    }
    y -= o.dopo ?? 0;
  };
  const campo = (etichetta: string, valore: string) => {
    spazio(26);
    page.drawText(perPdf(etichetta).toUpperCase(), { x: M, y: y - 7, size: 7, font: bold, color: rgb(0.45, 0.45, 0.5) });
    y -= 11;
    testo(valore, { size: 10, dopo: 5 });
  };

  page.drawRectangle({ x: 0, y: 841.89 - 74, width: 595.28, height: 74, color: rgb(0.12, 0.23, 0.37) });
  page.drawText("Certificato di firma elettronica", { x: M, y: 841.89 - 40, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(perPdf(d.azienda), { x: M, y: 841.89 - 58, size: 9.5, font: regular, color: rgb(0.85, 0.89, 0.95) });
  y = 841.89 - 74 - 22;

  campo("Documento firmato", d.documento);
  campo("Firmatario", `${d.firmatario} (${d.tipoFirmatario === "b2c" ? "privato" : "azienda"}) - ${d.email}`);
  campo("Data e ora della firma", `${d.firmatoIl} (ora italiana)`);
  campo("Verifica dell'identita", d.telefonoSms ? `Codice monouso a 6 cifre inviato all'indirizzo email del firmatario e via SMS al numero ${d.telefonoSms}, e inserito prima della firma.` : "Codice monouso a 6 cifre inviato all'indirizzo email del firmatario e inserito prima della firma.");
  campo("Provenienza", `Indirizzo IP ${d.ip ?? "non rilevato"}${d.userAgent ? ` - ${d.userAgent.slice(0, 140)}` : ""}`);
  campo("Impronta SHA-256 del documento", d.hashDocumento ?? "non disponibile");
  if (d.impronteDiverse) {
    testo("Attenzione: l'impronta del file al momento della firma e diversa da quella registrata all'invio.", { size: 9, font: bold, colore: [0.7, 0.1, 0.1], dopo: 5 });
  }
  if (d.tipoFirmatario === "b2c") {
    campo("Diritto di recesso", d.recessoAccettato ? "Informativa letta e accettata dal firmatario." : "Non registrato.");
  }

  if (d.clausole.length) {
    spazio(40);
    testo("Clausole approvate specificamente (artt. 1341 e 1342 c.c.)", { size: 10, font: bold, dopo: 2 });
    d.clausole.forEach((c, i) => testo(`${i + 1}. ${c}`, { size: 9, rientro: 8, dopo: 1 }));
    y -= 6;
  }

  spazio(70);
  page.drawRectangle({ x: M, y: y - 44, width: W, height: 44, color: rgb(0.94, 0.96, 0.98), borderColor: rgb(0.75, 0.8, 0.88), borderWidth: 0.8 });
  page.drawText("CODICE DI VERIFICA", { x: M + 12, y: y - 17, size: 7, font: bold, color: rgb(0.45, 0.45, 0.5) });
  page.drawText(perPdf(d.codiceVerifica), { x: M + 12, y: y - 36, size: 15, font: bold, color: rgb(0.12, 0.23, 0.37) });
  const idr = perPdf(`Richiesta ${d.richiestaId}`);
  page.drawText(idr, { x: M + W - 12 - regular.widthOfTextAtSize(idr, 7), y: y - 36, size: 7, font: regular, color: rgb(0.45, 0.45, 0.5) });
  y -= 60;

  testo(
    d.conTimbro
      ? "Ogni pagina del documento porta il timbro di firma. Il codice di verifica e l'impronta legano questo certificato al documento firmato e all'istante della firma; gli eventi (apertura del link, codice, firma) sono conservati dal sistema in un registro non modificabile."
      : "Il documento firmato non e un PDF: questo certificato ne riporta l'impronta SHA-256. Il codice di verifica lega il certificato al documento e all'istante della firma; gli eventi (apertura del link, codice, firma) sono conservati dal sistema in un registro non modificabile.",
    { size: 8, colore: [0.4, 0.4, 0.45] },
  );
}

export async function costruisciPdfFirmato(originale: Uint8Array | null, d: DatiCertificato): Promise<Uint8Array> {
  let pdf: PDFDocument;
  let conTimbro = false;
  if (originale) {
    try {
      pdf = await PDFDocument.load(originale, { ignoreEncryption: true });
      conTimbro = true;
    } catch (e) {
      console.warn("PDF originale non leggibile, resta il solo certificato:", e instanceof Error ? e.message : e);
      pdf = await PDFDocument.create();
    }
  } else {
    pdf = await PDFDocument.create();
  }
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dati = { ...d, conTimbro };
  if (conTimbro) timbra(pdf.getPages(), regular, dati);
  aggiungiCertificato(pdf, regular, bold, dati);
  pdf.setTitle(perPdf(`${d.documento} - firmato`));
  pdf.setProducer("Edilizia in Cloud");
  return await pdf.save();
}

/** Il file del documento firmato, se è nello storage: i byte, oppure null. */
// deno-lint-ignore no-explicit-any
async function scaricaOriginale(sb: any, r: { tipo_documento: string | null; quote_id: string | null; fv_progetto_id: string | null; sessione_id: string | null }): Promise<{ bytes: Uint8Array | null; titolo: string }> {
  let bucket: string | null = null;
  let path: string | null = null;
  let titolo = "Documento";
  if (r.tipo_documento === "quote" && r.quote_id) {
    const { data } = await sb.from("quotes").select("quote_number, pdf_storage_path").eq("id", r.quote_id).maybeSingle();
    titolo = data?.quote_number ? `Preventivo ${data.quote_number}` : "Preventivo";
    bucket = BUCKET; path = data?.pdf_storage_path ?? null;
  } else if (r.tipo_documento === "fv" && r.fv_progetto_id) {
    const { data } = await sb.from("fv_progetti").select("numero, pdf_vendita_url").eq("id", r.fv_progetto_id).maybeSingle();
    titolo = `Preventivo fotovoltaico ${data?.numero ?? ""}`.trim();
    bucket = "fv-progetti"; path = data?.pdf_vendita_url ?? null;
  } else if (r.tipo_documento === "sessione" && r.sessione_id) {
    const { data } = await sb.from("documento_sessioni").select("nome, pdf_url").eq("id", r.sessione_id).maybeSingle();
    titolo = data?.nome ?? titolo;
    // pdf_url è un indirizzo: si scarica da lì.
    if (data?.pdf_url) {
      try {
        const res = await fetch(data.pdf_url);
        if (res.ok) {
          const b = new Uint8Array(await res.arrayBuffer());
          return { bytes: b.length <= MAX_ORIGINALE ? b : null, titolo };
        }
      } catch { /* resta il certificato */ }
    }
    return { bytes: null, titolo };
  }
  if (!bucket || !path) return { bytes: null, titolo };
  const { data: file, error } = await sb.storage.from(bucket).download(path);
  if (error || !file) return { bytes: null, titolo };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes: bytes.length <= MAX_ORIGINALE ? bytes : null, titolo };
}

const eUnPdf = (b: Uint8Array) => b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/**
 * Costruisce (una volta) il PDF firmato della richiesta e lo salva. Chiamarla
 * quando la richiesta è `signed`. Se il file c'è già, lo restituisce.
 */
// deno-lint-ignore no-explicit-any
export async function assicuraPdfFirmato(sb: any, richiestaId: string): Promise<PdfFirmatoEsito> {
  const { data: r, error } = await sb
    .from("signature_requests")
    .select("id, company_id, status, tipo_documento, tipo_firmatario, signer_name, signer_email, signed_at, firma_ip, firma_user_agent, documento_hash, quote_id, fv_progetto_id, sessione_id, b2c_recesso, clausole_approvate, signer_phone, otp_canale, signed_pdf_path, signed_pdf_hash, codice_verifica")
    .eq("id", richiestaId)
    .maybeSingle();
  if (error || !r) throw new Error("Richiesta di firma non trovata");
  if (r.status !== "signed" || !r.signed_at) throw new Error("La richiesta non e ancora firmata");
  if (r.signed_pdf_path && r.codice_verifica) {
    return { path: r.signed_pdf_path, codiceVerifica: r.codice_verifica, hash: r.signed_pdf_hash ?? "", creato: false };
  }

  const { data: azienda } = await sb.from("companies").select("name").eq("id", r.company_id).maybeSingle();
  const { bytes, titolo } = await scaricaOriginale(sb, r);
  const originale = bytes && eUnPdf(bytes) ? bytes : null;
  const hashDocumento = bytes ? await sha256Hex(bytes) : (r.documento_hash ?? null);
  const impronteDiverse = !!(bytes && r.documento_hash && r.documento_hash !== hashDocumento);
  const codiceVerifica = await codiceDiVerifica(r.id, hashDocumento, r.signed_at);

  // Il testo delle clausole approvate: gli id sono quelli di clausoleFirma.ts.
  const attese = await clausoleDellaFirma(sb, r);
  const approvate = new Set<string>(Array.isArray(r.clausole_approvate) ? r.clausole_approvate : []);
  const clausole = attese.filter((c) => approvate.has(c.id)).map((c) => c.testo);

  const out = await costruisciPdfFirmato(originale, {
    azienda: azienda?.name ?? "Edilizia in Cloud",
    documento: titolo,
    firmatario: r.signer_name ?? "Firmatario",
    email: r.signer_email ?? "",
    tipoFirmatario: r.tipo_firmatario ?? "b2b",
    firmatoIl: dataItaliana(r.signed_at),
    ip: r.firma_ip ?? null,
    userAgent: r.firma_user_agent ?? null,
    hashDocumento,
    richiestaId: r.id,
    codiceVerifica,
    clausole,
    recessoAccettato: !!r.b2c_recesso,
    conTimbro: !!originale,
    impronteDiverse,
    telefonoSms: r.otp_canale === "sms" ? mascheraTelefono(r.signer_phone) : null,
  });

  const path = `${r.company_id}/firmati/${r.id}.pdf`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, out, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`Salvataggio del PDF firmato non riuscito: ${upErr.message}`);

  const hash = await sha256Hex(out);
  const { error: updErr } = await sb
    .from("signature_requests")
    .update({ signed_pdf_path: path, signed_pdf_hash: hash, codice_verifica: codiceVerifica, ...(r.documento_hash || !hashDocumento ? {} : { documento_hash: hashDocumento }) })
    .eq("id", r.id);
  if (updErr) throw new Error(`Registrazione del PDF firmato non riuscita: ${updErr.message}`);

  await sb.from("fea_audit_log").insert({
    request_id: r.id,
    company_id: r.company_id,
    evento: "certificato_generato",
    metadati: { path, hash, codice_verifica: codiceVerifica, con_timbro: !!originale, impronte_diverse: impronteDiverse },
  });
  return { path, codiceVerifica, hash, creato: true };
}
