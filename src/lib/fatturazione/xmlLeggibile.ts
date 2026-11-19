/**
 * L'XML della fattura elettronica letto in italiano (15/11/2026).
 *
 * Non rifà i conti e non ripesca niente dal documento: legge SOLO il file XML
 * che parte allo SDI e lo mostra come lo leggerebbe un umano, nome per nome.
 * Serve a rispondere alla domanda «quello che vedo nel PDF è davvero quello che
 * arriva all'Agenzia?»: se un dato non c'è nell'XML, qui non si vede.
 *
 * Modulo puro: niente React. Il DOMParser c'è sia nel browser sia in jsdom (test).
 */

/** Il nome leggibile di ogni elemento dello schema FatturaPA 1.2.2 che usiamo. */
export const ETICHETTE_XML: Record<string, string> = {
  FatturaElettronicaHeader: "Intestazione",
  FatturaElettronicaBody: "Corpo della fattura",
  DatiTrasmissione: "Dati di trasmissione",
  IdTrasmittente: "Trasmittente",
  IdPaese: "Paese",
  IdCodice: "Codice",
  ProgressivoInvio: "Progressivo invio",
  FormatoTrasmissione: "Formato",
  CodiceDestinatario: "Codice destinatario",
  ContattiTrasmittente: "Contatti del trasmittente",
  PECDestinatario: "PEC del destinatario",
  CedentePrestatore: "Chi emette (cedente/prestatore)",
  CessionarioCommittente: "Chi riceve (cessionario/committente)",
  RappresentanteFiscale: "Rappresentante fiscale",
  TerzoIntermediarioOSoggettoEmittente: "Intermediario o soggetto emittente",
  SoggettoEmittente: "Soggetto emittente",
  DatiAnagrafici: "Dati anagrafici",
  IdFiscaleIVA: "Partita IVA",
  CodiceFiscale: "Codice fiscale",
  Anagrafica: "Anagrafica",
  Denominazione: "Denominazione",
  Nome: "Nome",
  Cognome: "Cognome",
  Titolo: "Titolo",
  AlboProfessionale: "Albo professionale",
  ProvinciaAlbo: "Provincia dell'albo",
  NumeroIscrizioneAlbo: "Numero d'iscrizione all'albo",
  DataIscrizioneAlbo: "Data d'iscrizione all'albo",
  RegimeFiscale: "Regime fiscale",
  Sede: "Sede",
  StabileOrganizzazione: "Stabile organizzazione",
  IscrizioneREA: "Iscrizione REA",
  Ufficio: "Ufficio",
  NumeroREA: "Numero REA",
  CapitaleSociale: "Capitale sociale",
  SocioUnico: "Socio unico",
  StatoLiquidazione: "Stato di liquidazione",
  Contatti: "Contatti",
  Telefono: "Telefono",
  Email: "Email",
  Indirizzo: "Indirizzo",
  NumeroCivico: "Numero civico",
  CAP: "CAP",
  Comune: "Comune",
  Provincia: "Provincia",
  Nazione: "Nazione",
  DatiGenerali: "Dati generali",
  DatiGeneraliDocumento: "Documento",
  TipoDocumento: "Tipo documento",
  Divisa: "Valuta",
  Data: "Data",
  Numero: "Numero",
  DatiRitenuta: "Ritenuta",
  TipoRitenuta: "Tipo di ritenuta",
  ImportoRitenuta: "Importo della ritenuta",
  AliquotaRitenuta: "Aliquota della ritenuta",
  CausalePagamento: "Causale del pagamento",
  DatiBollo: "Bollo",
  BolloVirtuale: "Bollo virtuale",
  ImportoBollo: "Importo del bollo",
  DatiCassaPrevidenziale: "Cassa previdenziale",
  TipoCassa: "Tipo di cassa",
  AlCassa: "Aliquota cassa",
  ImportoContributoCassa: "Contributo cassa",
  ImponibileCassa: "Imponibile cassa",
  AliquotaIVA: "Aliquota IVA",
  Ritenuta: "Con ritenuta",
  Natura: "Natura (IVA non applicata)",
  RiferimentoAmministrazione: "Riferimento amministrazione",
  ScontoMaggiorazione: "Sconto o maggiorazione",
  Tipo: "Tipo",
  Percentuale: "Percentuale",
  Importo: "Importo",
  ImportoTotaleDocumento: "Totale documento",
  Arrotondamento: "Arrotondamento",
  Causale: "Causale",
  Art73: "Art. 73",
  DatiOrdineAcquisto: "Ordine d'acquisto",
  DatiContratto: "Contratto",
  DatiConvenzione: "Convenzione",
  DatiRicezione: "Ricezione",
  DatiFattureCollegate: "Fattura collegata",
  RiferimentoNumeroLinea: "Vale per la riga",
  IdDocumento: "Numero del documento",
  NumItem: "Lotto / voce",
  CodiceCommessaConvenzione: "Codice commessa/convenzione",
  CodiceCUP: "CUP",
  CodiceCIG: "CIG",
  DatiSAL: "Stato avanzamento lavori",
  RiferimentoFase: "Fase",
  DatiDDT: "Documento di trasporto",
  NumeroDDT: "Numero DDT",
  DataDDT: "Data DDT",
  DatiTrasporto: "Trasporto",
  DatiAnagraficiVettore: "Vettore",
  MezzoTrasporto: "Mezzo di trasporto",
  CausaleTrasporto: "Causale del trasporto",
  NumeroColli: "Numero di colli",
  Descrizione: "Descrizione",
  UnitaMisuraPeso: "Unità di misura del peso",
  PesoLordo: "Peso lordo",
  PesoNetto: "Peso netto",
  DataOraRitiro: "Data e ora del ritiro",
  DataInizioTrasporto: "Inizio del trasporto",
  TipoResa: "Tipo di resa",
  IndirizzoResa: "Indirizzo di resa",
  DataOraConsegna: "Data e ora della consegna",
  FatturaPrincipale: "Fattura principale",
  NumeroFatturaPrincipale: "Numero della fattura principale",
  DataFatturaPrincipale: "Data della fattura principale",
  DatiBeniServizi: "Beni e servizi",
  DettaglioLinee: "Riga",
  NumeroLinea: "Riga n.",
  TipoCessionePrestazione: "Tipo di cessione/prestazione",
  CodiceArticolo: "Codice articolo",
  CodiceTipo: "Tipo di codice",
  CodiceValore: "Valore del codice",
  Quantita: "Quantità",
  UnitaMisura: "Unità di misura",
  DataInizioPeriodo: "Inizio del periodo",
  DataFinePeriodo: "Fine del periodo",
  PrezzoUnitario: "Prezzo unitario",
  PrezzoTotale: "Imponibile della riga",
  AltriDatiGestionali: "Altri dati gestionali",
  TipoDato: "Tipo di dato",
  RiferimentoTesto: "Testo",
  RiferimentoNumero: "Numero",
  RiferimentoData: "Data",
  DatiRiepilogo: "Riepilogo IVA",
  ImponibileImporto: "Imponibile",
  Imposta: "Imposta",
  EsigibilitaIVA: "Esigibilità IVA",
  SpeseAccessorie: "Spese accessorie",
  RiferimentoNormativo: "Riferimento normativo",
  DatiVeicoli: "Veicoli",
  DataImmatricolazione: "Data d'immatricolazione",
  TotalePercorso: "Totale percorso",
  DatiPagamento: "Pagamento",
  CondizioniPagamento: "Condizioni di pagamento",
  DettaglioPagamento: "Dettaglio del pagamento",
  Beneficiario: "Beneficiario",
  ModalitaPagamento: "Modalità di pagamento",
  DataRiferimentoTerminiPagamento: "Data di riferimento dei termini",
  GiorniTerminiPagamento: "Giorni dei termini",
  DataScadenzaPagamento: "Scadenza",
  ImportoPagamento: "Importo",
  CodUfficioPostale: "Ufficio postale",
  CognomeQuietanzante: "Cognome del quietanzante",
  NomeQuietanzante: "Nome del quietanzante",
  CFQuietanzante: "CF del quietanzante",
  TitoloQuietanzante: "Titolo del quietanzante",
  IstitutoFinanziario: "Istituto finanziario",
  IBAN: "IBAN",
  ABI: "ABI",
  CAB: "CAB",
  BIC: "BIC",
  ScontoPagamentoAnticipato: "Sconto per pagamento anticipato",
  DataLimitePagamentoAnticipato: "Data limite del pagamento anticipato",
  PenalitaPagamentiRitardati: "Penale per ritardo",
  DataDecorrenzaPenale: "Decorrenza della penale",
  CodicePagamento: "Codice del pagamento",
  Allegati: "Allegato",
  NomeAttachment: "Nome del file",
  AlgoritmoCompressione: "Compressione",
  FormatoAttachment: "Formato",
  DescrizioneAttachment: "Descrizione",
  Attachment: "Contenuto",
};

/** I valori che si leggono meglio tradotti (sono codici nello schema). */
const VALORI: Record<string, Record<string, string>> = {
  FormatoTrasmissione: { FPA12: "FPA12 — verso la Pubblica Amministrazione", FPR12: "FPR12 — verso privati" },
  EsigibilitaIVA: { I: "I — immediata", D: "D — differita", S: "S — scissione dei pagamenti (split payment)" },
  TipoDocumento: {
    TD01: "TD01 — fattura", TD02: "TD02 — acconto/anticipo su fattura", TD03: "TD03 — acconto/anticipo su parcella",
    TD04: "TD04 — nota di credito", TD05: "TD05 — nota di debito", TD06: "TD06 — parcella",
    TD16: "TD16 — integrazione reverse charge interno", TD17: "TD17 — integrazione/autofattura per acquisti dall'estero",
    TD18: "TD18 — integrazione per acquisto di beni intracomunitari", TD19: "TD19 — integrazione/autofattura ex art. 17 c.2",
    TD20: "TD20 — autofattura", TD21: "TD21 — autofattura per splafonamento", TD24: "TD24 — fattura differita",
    TD25: "TD25 — fattura differita (art. 21 c.4 lett. b)", TD27: "TD27 — fattura per autoconsumo",
  },
  BolloVirtuale: { SI: "SI — assolto in modo virtuale" },
  SocioUnico: { SU: "SU — socio unico", SM: "SM — più soci" },
  StatoLiquidazione: { LS: "LS — in liquidazione", LN: "LN — non in liquidazione" },
  Ritenuta: { SI: "SI — la riga è soggetta a ritenuta" },
  Tipo: { SC: "SC — sconto", MG: "MG — maggiorazione" },
};

/** Gli elementi il cui valore è un importo in euro. */
const IMPORTI = new Set([
  "ImportoTotaleDocumento", "ImportoRitenuta", "ImportoBollo", "ImportoContributoCassa", "ImponibileCassa",
  "PrezzoUnitario", "PrezzoTotale", "ImponibileImporto", "Imposta", "ImportoPagamento", "Arrotondamento",
  "SpeseAccessorie", "CapitaleSociale", "PenalitaPagamentiRitardati",
]);
/** Gli elementi il cui valore è una percentuale. */
const PERCENTUALI = new Set(["AliquotaIVA", "AliquotaRitenuta", "AlCassa", "Percentuale"]);

export interface NodoXml {
  tag: string;
  etichetta: string;
  /** Il valore come sta nel file (null per i blocchi). */
  grezzo: string | null;
  /** Il valore come si legge (importi in euro, date in gg/mm/aaaa, codici spiegati). */
  valore: string | null;
  figli: NodoXml[];
  /** Nella copia completa si conservano anche gli attributi del documento. */
  attributi?: Array<{ nome: string; valore: string }>;
  binario?: boolean;
  testoMisto?: string;
  nomeXml?: string;
}

const euro = (v: string): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  // Come nel PDF: il separatore delle migliaia anche sotto le cinque cifre.
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean })} €`;
};

const percentuale = (v: string): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
};

/** "2026-11-15" → "15/11/2026" (gli altri testi restano com'erano). */
export function dataLeggibile(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function valoreLeggibile(tag: string, grezzo: string): string {
  const v = grezzo.trim();
  if (!v) return v;
  if (VALORI[tag]?.[v]) return VALORI[tag][v];
  if (IMPORTI.has(tag)) return euro(v);
  if (PERCENTUALI.has(tag)) return percentuale(v);
  if (/^Data/.test(tag) || tag === "Data") return dataLeggibile(v);
  return v;
}

function nodoDa(el: Element, completo = false, esclusi?: Set<Element>): NodoXml {
  const figliElemento = Array.from(el.children).filter(e => !esclusi?.has(e));
  const tag = el.localName;
  const etichetta = ETICHETTE_XML[tag] ?? tag;
  const attributi = completo ? Array.from(el.attributes).map(a => ({ nome: a.name, valore: a.value })) : undefined;
  const extra = completo ? { attributi, nomeXml: el.tagName } : {};
  if (completo && ['Attachment', 'SignatureValue', 'X509Certificate', 'X509CRL', 'Modulus'].includes(tag)) {
    return { tag, etichetta, grezzo: null, valore: tag === 'Attachment' ? 'Contenuto disponibile nell’allegato e nel file originale.' : 'Contenuto della firma digitale conservato nel file originale.', figli: [], binario: true, ...extra };
  }
  if (figliElemento.length === 0) {
    const grezzo = (el.textContent ?? "").trim();
    return { tag, etichetta, grezzo, valore: valoreLeggibile(tag, grezzo), figli: [], ...extra };
  }
  const testoMisto = completo ? Array.from(el.childNodes).filter(n => n.nodeType === 3 || n.nodeType === 4).map(n => n.textContent?.trim() ?? '').filter(Boolean).join('\n') : '';
  return { tag, etichetta, grezzo: null, valore: null, figli: figliElemento.map(e => nodoDa(e, completo, esclusi)), ...extra, ...(testoMisto ? { testoMisto } : {}) };
}

export class XmlNonLeggibile extends Error {}

/**
 * Le sezioni del file: intestazione e corpo appiattiti al primo livello utile
 * (Dati di trasmissione, chi emette, chi riceve, dati generali, righe, IVA,
 * pagamento, allegati), nell'ordine in cui stanno nel file.
 */
export function sezioniFatturaXml(xml: string): NodoXml[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new XmlNonLeggibile("Il file XML non si legge.");
  const radice = doc.documentElement;
  if (!radice || radice.localName !== "FatturaElettronica") throw new XmlNonLeggibile("Il file non è una FatturaPA.");
  const sezioni: NodoXml[] = [];
  for (const parte of Array.from(radice.children)) {
    for (const blocco of Array.from(parte.children)) sezioni.push(nodoDa(blocco));
  }
  return sezioni;
}

/** Tutti i dati del corpo scelto e dell'intestazione, inclusi campi sconosciuti.
 * Gli allegati e le firme rimangono scaricabili dall'originale: non si stampano
 * megabyte di base64 dentro la rappresentazione leggibile. */
export function documentoFatturaXml(xml: string, parser: DOMParser, indiceCorpo = 0): NodoXml | null {
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagNameNS('*', 'parsererror').length) return null;
  const radice = doc.documentElement;
  if (radice?.localName !== 'FatturaElettronica') return null;
  const corpi = Array.from(radice.children).filter(e => e.localName === 'FatturaElettronicaBody');
  if (!Number.isInteger(indiceCorpo) || indiceCorpo < 0 || !corpi[indiceCorpo]) return null;
  return nodoDa(radice, true, new Set(corpi.filter((_, i) => i !== indiceCorpo)));
}

/** La versione del file (FPA12 verso la PA, FPR12 verso i privati). */
export function versioneFatturaXml(xml: string): string {
  const m = /versione="([^"]+)"/.exec(xml);
  return m ? m[1] : "";
}

/** Tutti i valori di un elemento, ovunque stia nel file: per i controlli. */
export function valoriXml(xml: string, tag: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagNameNS("*", tag)).map((e) => (e.textContent ?? "").trim());
}
