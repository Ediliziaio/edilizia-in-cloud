import type { EvidenzaFascicolo } from "./fascicolo";
/** Promemoria documentali: la raccolta dei file non dimostra l’applicabilità
 * di un obbligo né l’idoneità complessiva dell’impresa. Le scelte del caso
 * concreto vengono registrate nel fascicolo, con soggetto e riferimenti. */

export type TipoDocumentoSicurezza =
  | "psc" | "pss" | "pos_impresa" | "notifica_preliminare" | "fascicolo_opera" | "pimus"
  | "verbale_coordinamento" | "nomina_coordinatori" | "durc" | "idoneita_tecnica" | "dvr"
  | "patente_crediti" | "piano_emergenza" | "schede_sicurezza" | "valutazione_rumore"
  | "libretti_macchine" | "verifiche_attrezzature" | "formazione" | "consegna_dpi" | "altro";

export const TIPI_SICUREZZA: Record<TipoDocumentoSicurezza, { label: string; aiuto: string; scade?: boolean }> = {
  psc: { label: "PSC – Piano di sicurezza e coordinamento", aiuto: "Lo redige il coordinatore in progettazione (CSP) per il committente, quando in cantiere ci sono più imprese." },
  pss: { label: "PSS – Piano sostitutivo di sicurezza", aiuto: "Documento dell’archivio precedente: verificare il regime e il contratto applicabili." },
  pos_impresa: { label: "POS di un'altra impresa", aiuto: "Il POS di un subappaltatore o di un'impresa in cantiere, da verificare prima dell'ingresso." },
  notifica_preliminare: { label: "Notifica preliminare", aiuto: "Del committente all'ASL e all'Ispettorato (art. 99): copia affissa in cantiere." },
  fascicolo_opera: { label: "Fascicolo dell'opera", aiuto: "Per la manutenzione futura dell'opera, preparato dal coordinatore." },
  pimus: { label: "PiMUS – Montaggio ponteggi", aiuto: "Piano di montaggio, uso e smontaggio dei ponteggi (art. 136)." },
  verbale_coordinamento: { label: "Verbale del coordinatore (CSE)", aiuto: "Riunioni di coordinamento, sopralluoghi, verifica dei POS." },
  nomina_coordinatori: { label: "Nomina dei coordinatori (CSP/CSE)", aiuto: "Lettere di incarico del committente ai coordinatori." },
  durc: { label: "DURC", aiuto: "Regolarità contributiva: vale 120 giorni.", scade: true },
  idoneita_tecnica: { label: "Idoneità tecnico-professionale", aiuto: "Visura, dichiarazioni e documenti dell'Allegato XVII per le imprese in cantiere." },
  dvr: { label: "DVR – Valutazione dei rischi", aiuto: "Il documento di valutazione dei rischi dell'impresa." },
  patente_crediti: { label: "Patente a crediti", aiuto: "Verificare applicabilità ed eventuali esclusioni per il soggetto e i lavori; la sola presenza in cantiere non basta.", scade: true },
  piano_emergenza: { label: "Piano di emergenza", aiuto: "Gestione emergenze, primo soccorso, antincendio ed evacuazione." },
  schede_sicurezza: { label: "Schede di sicurezza prodotti", aiuto: "Delle sostanze e miscele pericolose usate in cantiere." },
  valutazione_rumore: { label: "Valutazione del rumore", aiuto: "Esito della valutazione del rischio rumore." },
  libretti_macchine: { label: "Libretti e marcature macchine", aiuto: "Libretti d'uso, marcature CE, dichiarazioni di conformità." },
  verifiche_attrezzature: { label: "Verifiche periodiche attrezzature", aiuto: "Gru, apparecchi di sollevamento, impianti di messa a terra.", scade: true },
  formazione: { label: "Attestati di formazione", aiuto: "Corsi sicurezza, preposti, addetti emergenze, attrezzature.", scade: true },
  consegna_dpi: { label: "Consegna DPI", aiuto: "Verbali di consegna dei dispositivi di protezione." },
  altro: { label: "Altro documento", aiuto: "Qualunque altro documento di sicurezza." },
};

/**
 * Da dove arriva il documento: l'archivio della sicurezza, la scheda del
 * subappaltatore (caricamento singolo) o il suo fascicolo (caricamento in massa
 * e lettura AI). Un documento si carica UNA volta e si vede ovunque.
 */
export type FonteDocumento = "sicurezza" | "subappaltatore" | "fascicolo" | "fascicolo_cantiere";

export interface DocumentoSicurezza {
  stato_verifica?: EvidenzaFascicolo["stato"];
  ambito_da_verificare?: boolean;
  id: string;
  /** Assente = archivio della sicurezza. */
  fonte?: FonteDocumento;
  /** Bucket del file (assente = sicurezza-documenti). */
  bucket?: string;
  order_id: string | null;
  subappaltatore_id: string | null;
  tipo: TipoDocumentoSicurezza;
  titolo: string;
  file_path: string;
  file_name: string;
  data_documento: string | null;
  data_scadenza: string | null;
  note: string | null;
  created_at: string;
}

export type StatoVoce = "ok" | "manca" | "scaduto" | "in_scadenza" | "in_corso";

export interface VoceControllo {
  chiave: string;
  titolo: string;
  perche: string;
  stato: StatoVoce;
  dettaglio?: string;
  /** Tipo da proporre quando si carica il documento mancante. */
  tipo?: TipoDocumentoSicurezza;
  subappaltatoreId?: string;
  /** Da fare nel POS (editor), non con un caricamento. */
  nelPos?: boolean;
}

export interface DatiControllo {
  orderId?: string;
  oggi: string; // yyyy-mm-dd
  /** Documenti della commessa più quelli di tutta l'azienda (order_id null). */
  documenti: DocumentoSicurezza[];
  /** `verificaNegativa`: l'affidataria o il CSE hanno dato esito negativo (art. 101 c. 3): i lavori non possono iniziare. */
  pos: Array<{ status: string | null; verificaNegativa?: boolean }>;
  subappaltatori: Array<{ id: string; ragione_sociale: string | null; durc_scadenza: string | null }>;
  ponteggiMontati: boolean;
}

const GIORNI_PREAVVISO = 30;

function giorniTra(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000);
}

/** Stato di un documento: scaduto, in scadenza (entro 30 giorni) o valido. */
export function statoScadenza(scadenza: string | null | undefined, oggi: string): StatoVoce {
  if (!scadenza) return "ok";
  const g = giorniTra(oggi, scadenza);
  if (g < 0) return "scaduto";
  if (g <= GIORNI_PREAVVISO) return "in_scadenza";
  return "ok";
}

const dataIT = (d: string) => d.split("-").reverse().join("/");

/** Il documento più recente di un tipo (eventualmente di un subappaltatore). */
function ultimo(docs: DocumentoSicurezza[], tipo: TipoDocumentoSicurezza, sub?: string, soloAzienda = false) {
  return docs
    .filter((d) => d.tipo === tipo && (sub === undefined ? !soloAzienda || d.subappaltatore_id == null : d.subappaltatore_id === sub))
    .sort((a, b) => (b.data_documento ?? b.created_at).localeCompare(a.data_documento ?? a.created_at))[0];
}

function voceDocumento(
  chiave: string, titolo: string, perche: string, doc: DocumentoSicurezza | undefined, oggi: string,
  tipo: TipoDocumentoSicurezza, subappaltatoreId?: string,
): VoceControllo {
  if (!doc) return { chiave, titolo, perche, stato: "manca", tipo, subappaltatoreId };
  const scadenza = statoScadenza(doc.data_scadenza, oggi);
  if(doc.ambito_da_verificare) return {chiave,titolo,perche,stato:scadenza==='scaduto'?'scaduto':'in_corso',tipo,subappaltatoreId,dettaglio:'Associa e verifica il POS per questo cantiere: il caricamento precedente non ne documenta l’ambito.'};
  if(!doc.file_path.trim()) return {chiave,titolo,perche,stato:'in_corso',tipo,subappaltatoreId,dettaglio:'Richiesta registrata: documento da ricevere e verificare.'};
  if(doc.stato_verifica!=='verificato') return {chiave,titolo,perche,stato:scadenza==='scaduto'?'scaduto':'in_corso',tipo,subappaltatoreId,dettaglio:doc.stato_verifica?'Evidenza nel fascicolo: verifica documentale da completare.':'File nell’archivio precedente: la verifica non è documentata.'};
  const stato = scadenza;
  return {
    chiave, titolo, perche, stato, tipo, subappaltatoreId,
    dettaglio: doc.data_scadenza ? `${stato === "scaduto" ? "Scaduto il" : "Scade il"} ${dataIT(doc.data_scadenza)}` : doc.file_name,
  };
}

/** La lista di controllo della commessa, nell'ordine in cui conviene leggerla. */
export function listaControlloCommessa(d: DatiControllo): VoceControllo[] {
  const voci: VoceControllo[] = [];
  const piuImprese = d.subappaltatori.length > 0;
  const docsCantiere=d.documenti.filter(x=>!!x.order_id&&(!d.orderId||x.order_id===d.orderId)&&!x.subappaltatore_id);

  // POS della propria impresa: sempre.
  const approvati = d.pos.filter((p) => p.status === "approvato" || p.status === "firmato" || p.status === "consegnato");
  const posApprovato = approvati.length > 0;
  // Approvato nell'app ma con esito negativo di chi verifica (art. 101 c. 3): non è «ok», i lavori non possono iniziare.
  const verificaNegativa = approvati.some((p) => p.verificaNegativa);
  voci.push({
    chiave: "pos", titolo: "POS della tua impresa", perche: "Controlla il POS pertinente, la sua revisione e l’iter applicabile; l’approvazione nell’app non attesta firme o consegne.",
    stato: posApprovato ? (verificaNegativa ? "in_corso" : "ok") : d.pos.length ? "in_corso" : "manca", nelPos: true,
    dettaglio: verificaNegativa ? "Verifica negativa dell’impresa affidataria o del coordinatore: i lavori non possono iniziare. Apri una nuova revisione e correggi il POS."
      : posApprovato ? "Approvato" : d.pos.length ? "In preparazione: completalo e approvalo" : undefined,
  });

  // Impresa: patente a crediti e DURC (anche caricati per tutta l'azienda).
  const docsImpresa = d.documenti.filter((x) => x.subappaltatore_id == null);
  voci.push(voceDocumento("patente", "Patente a crediti dell'impresa", "Verifica applicabilità ed eventuali esclusioni per il soggetto e i lavori affidati.",
    ultimo(docsImpresa, "patente_crediti", undefined, true), d.oggi, "patente_crediti"));
  const patente=voci.find(v=>v.chiave==='patente');
  if(patente?.stato==='manca'){patente.stato='in_corso';patente.dettaglio='Applicabilità da confermare nel fascicolo; eventuale esclusione da motivare e documentare.';}
  voci.push(voceDocumento("durc", "DURC dell'impresa", "Regolarità contributiva, vale 120 giorni.",
    ultimo(docsImpresa, "durc", undefined, true), d.oggi, "durc"));

  if (piuImprese) {
    voci.push(voceDocumento("psc", "PSC del committente", "Verifica il PSC previsto per il caso concreto e la revisione pertinente.",
      ultimo(docsCantiere, "psc"), d.oggi, "psc"));
    voci.push(voceDocumento("nomina", "Nomina dei coordinatori (CSP/CSE)", "Controlla gli incarichi dei coordinatori applicabili e i relativi atti.",
      ultimo(docsCantiere, "nomina_coordinatori"), d.oggi, "nomina_coordinatori"));
    voci.push(voceDocumento("notifica", "Notifica preliminare", "Verifica applicabilità, aggiornamenti e ricevute della notifica per il cantiere.",
      ultimo(docsCantiere, "notifica_preliminare"), d.oggi, "notifica_preliminare"));
    for (const s of d.subappaltatori) {
      const nome = s.ragione_sociale || "Subappaltatore";
      voci.push(voceDocumento(`pos-${s.id}`, `POS di ${nome}`, "Ogni impresa in cantiere consegna il proprio POS prima di entrare.",
        ultimo(d.documenti, "pos_impresa", s.id), d.oggi, "pos_impresa", s.id));
      // Il DURC del subappaltatore può essere un documento caricato o la data in anagrafica.
      const durcDoc = ultimo(d.documenti, "durc", s.id);
      const durcVoce = voceDocumento(`durc-${s.id}`, `DURC di ${nome}`, "Da verificare prima dell'ingresso e a ogni scadenza.", durcDoc, d.oggi, "durc", s.id);
      if (!durcDoc && s.durc_scadenza) {
        const stato = statoScadenza(s.durc_scadenza, d.oggi);
        Object.assign(durcVoce, { stato:stato==="scaduto"?stato:"in_corso", dettaglio: `${stato === "scaduto" ? "Scaduto il" : "Scade il"} ${dataIT(s.durc_scadenza)} (data dalla scheda; esito documentale da acquisire e verificare)` });
      }
      voci.push(durcVoce);
      // The archive categories are only pieces of an ITP dossier. Even two
      // verified files cannot stand in for the assessment of the actual case.
      const visura = ultimo(d.documenti, "idoneita_tecnica", s.id);
      const dvr = ultimo(d.documenti, "dvr", s.id);
      const mancanti = [!visura && "visura / documentazione tecnico-professionale", !dvr && "DVR"].filter(Boolean) as string[];
      const scaduti=[visura,dvr].some(doc=>doc&&statoScadenza(doc.data_scadenza,d.oggi)==='scaduto');
      voci.push({
        chiave: `itp-${s.id}`, titolo: `Idoneità tecnico-professionale di ${nome}`,
        perche: "La documentazione richiesta dipende dal soggetto e dai lavori. La valutazione complessiva non è dedotta dai file caricati.",
        stato:scaduti?'scaduto':mancanti.length===2?'manca':'in_corso',
        dettaglio:mancanti.length?`Da raccogliere / confermare secondo applicabilità: ${mancanti.join(", ")}`:'Documentazione presente; consulta nella scheda impresa l’esito della valutazione e il suo ambito.',
        tipo: visura ? "dvr" : "idoneita_tecnica", subappaltatoreId: s.id,
      });
    }
  }

  if (d.ponteggiMontati) {
    voci.push(voceDocumento("pimus", "PiMUS dei ponteggi", "Con ponteggi montati serve il piano di montaggio, uso e smontaggio.",
      ultimo(docsCantiere, "pimus"), d.oggi, "pimus"));
  }

  // Ogni altro documento con scadenza superata o vicina (attestati, verifiche…).
  const giaContati = new Set(["patente_crediti", "durc", "psc", "nomina_coordinatori", "notifica_preliminare", "pos_impresa", "idoneita_tecnica", "dvr", "pimus"]);
  for (const doc of d.documenti) {
    if (giaContati.has(doc.tipo) || !doc.data_scadenza) continue;
    const stato = statoScadenza(doc.data_scadenza, d.oggi);
    if (stato === "ok") continue;
    voci.push({
      chiave: `doc-${doc.id}`, titolo: doc.titolo, perche: TIPI_SICUREZZA[doc.tipo]?.label ?? "Documento",
      stato, tipo: doc.tipo, dettaglio: `${stato === "scaduto" ? "Scaduto il" : "Scade il"} ${dataIT(doc.data_scadenza)}`,
    });
  }
  return voci;
}

/** Quante voci vanno sistemate (mancanti, scadute, in scadenza, da completare). */
export function daSistemare(voci: VoceControllo[]): number {
  return voci.filter((v) => v.stato !== "ok").length;
}

/** Dai tipi della scheda del subappaltatore e del fascicolo ai tipi della sicurezza. */
export function tipoDaSubappaltatore(tipo: string): TipoDocumentoSicurezza {
  switch (tipo) {
    case "durc": return "durc";
    case "pos": return "pos_impresa";
    case "dvr": return "dvr";
    case "visura": case "visura_camerale": return "idoneita_tecnica";
    case "formazione_operai": return "formazione";
    default: return "altro";
  }
}

/** E al contrario: il tipo con cui un documento della sicurezza va nella scheda del subappaltatore. */
export function tipoPerSubappaltatore(tipo: TipoDocumentoSicurezza): "durc" | "pos" | "dvr" | "visura_camerale" | "altro" {
  switch (tipo) {
    case "durc": return "durc";
    case "pos_impresa": return "pos";
    case "dvr": return "dvr";
    case "idoneita_tecnica": return "visura_camerale";
    default: return "altro";
  }
}


/** Shared checklist reads native evidence without copying files or promoting uploads to verification. */
export function documentoDaEvidenza(e:EvidenzaFascicolo):DocumentoSicurezza|null {
  if(e.stato==='superato'||e.stato==='non_applicabile')return null;
  const tipi:Record<string,TipoDocumentoSicurezza>={pos:'pos_impresa',visura:'idoneita_tecnica',dpi:'consegna_dpi',sds:'schede_sicurezza',attrezzatura:'libretti_macchine'};
  const tipo=tipi[e.tipo]??(e.tipo in TIPI_SICUREZZA?e.tipo as TipoDocumentoSicurezza:'altro');
  return {id:`evidenza-${e.id}`,fonte:'fascicolo_cantiere',bucket:'fascicoli-cantiere',order_id:e.order_id,subappaltatore_id:e.subappaltatore_id,tipo,titolo:e.titolo,file_path:e.file_path??'',file_name:e.file_name??'',data_documento:e.data_rilascio,data_scadenza:e.data_scadenza,note:e.note,created_at:e.updated_at,stato_verifica:e.stato};
}
