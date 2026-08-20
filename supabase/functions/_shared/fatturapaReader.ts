/**
 * Lettore FatturaPA — puro, senza dipendenze da Deno né dal browser.
 *
 * Il parser XML viene INIETTATO dal chiamante: in produzione arriva da
 * deno_dom, nei test dal DOM di jsdom. Cosi' quello che gira sul server e
 * quello che viene verificato dai test sono la stessa identica funzione,
 * invece di due copie destinate a divergere.
 *
 * Le regole contabili che vivono qui, e il perche':
 *
 *   - imponibile e imposta si prendono dai DatiRiepilogo, NON sommando le
 *     righe: con sconti e arrotondamenti i due totali divergono di qualche
 *     centesimo ed e' il riepilogo a fare fede per il registro IVA.
 *   - il totale e' ImportoTotaleDocumento quando c'e'. E' l'unico campo che
 *     tiene conto di bollo, cassa previdenziale e ritenute; ricalcolarlo da
 *     imponibile + imposta darebbe un numero diverso da quello che il
 *     cliente vede sulla fattura.
 *   - le partite IVA si leggono navigando il PERCORSO esatto, mai col primo
 *     IdCodice che si incontra: nell'intestazione ce ne sono fino a quattro e
 *     la prima e' dell'intermediario che trasmette (TeamSystem, Aruba), non
 *     di chi ha emesso.
 */

// Interfacce minime: sia il DOM del browser sia deno_dom le soddisfano.
export interface ElementoXml {
  getElementsByTagName(nome: string): ArrayLike<ElementoXml>;
  textContent: string | null;
}
export interface DocumentoXml {
  getElementsByTagName(nome: string): ArrayLike<ElementoXml>;
}
export interface LettoreXml {
  parseFromString(xml: string, tipo: string): DocumentoXml | null;
}

export interface RigaFattura {
  description: string;
  product_code: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  tax_nature: string | null;
  line_net: number;
  line_tax: number;
  line_gross: number;
  sort_order: number;
}

export interface AnagraficaFattura {
  nome: string;
  piva: string | null;
  cf: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  paese: string;
}

export interface FatturaLetta {
  cedentePiva: string;
  cedenteNome: string;
  cessionarioPiva: string | null;
  numero: string;
  data: string;
  documentType: "invoice" | "credit_note";
  cliente: AnagraficaFattura & { pec: string | null; sdi: string | null };
  imponibile: number;
  imposta: number;
  totale: number;
  bollo: number;
  scadenza: string | null;
  modalitaPagamento: string | null;
  iban: string | null;
  righe: RigaFattura[];
}

function primo(el: ElementoXml | DocumentoXml | null | undefined, tag: string): ElementoXml | null {
  if (!el) return null;
  const trovati = el.getElementsByTagName(tag);
  return trovati.length > 0 ? trovati[0] : null;
}

function testo(el: ElementoXml | DocumentoXml | null | undefined, tag: string): string {
  return primo(el, tag)?.textContent?.trim() ?? "";
}

/** I decimali FatturaPA usano il punto, ma qualche gestionale manda la virgola. */
export function numeroXml(v: string): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function numero(el: ElementoXml | DocumentoXml | null | undefined, tag: string): number {
  return numeroXml(testo(el, tag));
}

/** Due decimali, come su qualsiasi documento contabile. */
export function arrotonda(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizzaPiva(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
}

/** TD04 e TD08 sono note di credito: trattarle come fatture gonfia i ricavi. */
export function tipoDocumento(td: string): "invoice" | "credit_note" {
  return td === "TD04" || td === "TD08" ? "credit_note" : "invoice";
}

function leggiAnagrafica(parte: ElementoXml | null): AnagraficaFattura {
  const datiAnagrafici = primo(parte, "DatiAnagrafici");
  const anagrafica = primo(datiAnagrafici, "Anagrafica");
  const sede = primo(parte, "Sede");

  // Le societa' hanno Denominazione, le persone fisiche Nome + Cognome.
  const nome = testo(anagrafica, "Denominazione") ||
    `${testo(anagrafica, "Nome")} ${testo(anagrafica, "Cognome")}`.trim();

  return {
    nome: nome || "Sconosciuto",
    piva: normalizzaPiva(testo(primo(datiAnagrafici, "IdFiscaleIVA"), "IdCodice")) || null,
    cf: testo(datiAnagrafici, "CodiceFiscale") || null,
    indirizzo: testo(sede, "Indirizzo") || null,
    citta: testo(sede, "Comune") || null,
    cap: testo(sede, "CAP") || null,
    provincia: testo(sede, "Provincia") || null,
    paese: testo(sede, "Nazione") || "IT",
  };
}

/**
 * Legge una fattura elettronica. Ritorna null se il file non e' una fattura
 * leggibile: mai un oggetto a meta', che a valle diventerebbe una riga
 * contabile sbagliata.
 */
export function leggiFatturaPA(xml: string, parser: LettoreXml): FatturaLetta | null {
  let doc: DocumentoXml | null;
  try {
    doc = parser.parseFromString(xml, "text/xml");
  } catch {
    return null;
  }
  if (!doc) return null;
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const header = primo(doc, "FatturaElettronicaHeader");
  const body = primo(doc, "FatturaElettronicaBody");
  if (!header || !body) return null;

  // PERCORSO esatto, non il primo IdCodice che capita.
  const cedente = primo(header, "CedentePrestatore");
  const cessionario = primo(header, "CessionarioCommittente");
  if (!cedente || !cessionario) return null;

  const anagCedente = leggiAnagrafica(cedente);
  const anagCliente = leggiAnagrafica(cessionario);
  if (!anagCedente.piva) return null;

  const dgd = primo(body, "DatiGeneraliDocumento");
  const numeroFattura = testo(dgd, "Numero");
  const data = testo(dgd, "Data");
  if (!numeroFattura || !data) return null;

  // DatiTrasmissione vive nell'HEADER: cercarlo nel body lascerebbe vuoti
  // codice destinatario e PEC su ogni fattura, in silenzio.
  const trasmissione = primo(header, "DatiTrasmissione");

  let imponibile = 0;
  let imposta = 0;
  for (const r of Array.from(body.getElementsByTagName("DatiRiepilogo"))) {
    imponibile += numero(r, "ImponibileImporto");
    imposta += numero(r, "Imposta");
  }

  const totaleDichiarato = numero(dgd, "ImportoTotaleDocumento");
  const pagamento = primo(body, "DettaglioPagamento");

  const righe: RigaFattura[] = Array.from(body.getElementsByTagName("DettaglioLinee")).map((el, i) => {
    const lineNet = numero(el, "PrezzoTotale");
    const aliquota = numero(el, "AliquotaIVA");
    const lineTax = arrotonda(lineNet * (aliquota / 100));
    return {
      description: testo(el, "Descrizione") || "Voce senza descrizione",
      product_code: testo(el, "CodiceValore") || null,
      unit: testo(el, "UnitaMisura") || "pz",
      quantity: numero(el, "Quantita") || 1,
      unit_price: numero(el, "PrezzoUnitario"),
      discount_percent: 0,
      tax_rate: aliquota,
      tax_nature: testo(el, "Natura") || null,
      line_net: lineNet,
      line_tax: lineTax,
      line_gross: arrotonda(lineNet + lineTax),
      sort_order: i,
    };
  });

  return {
    cedentePiva: anagCedente.piva,
    cedenteNome: anagCedente.nome,
    cessionarioPiva: anagCliente.piva,
    numero: numeroFattura,
    data,
    documentType: tipoDocumento(testo(dgd, "TipoDocumento")),
    cliente: {
      ...anagCliente,
      pec: testo(trasmissione, "PECDestinatario") || null,
      sdi: testo(trasmissione, "CodiceDestinatario") || null,
    },
    imponibile: arrotonda(imponibile),
    imposta: arrotonda(imposta),
    totale: arrotonda(totaleDichiarato || imponibile + imposta),
    bollo: numero(primo(dgd, "DatiBollo"), "ImportoBollo"),
    scadenza: testo(pagamento, "DataScadenzaPagamento") || null,
    modalitaPagamento: testo(pagamento, "ModalitaPagamento") || null,
    iban: testo(pagamento, "IBAN") || null,
    righe,
  };
}
