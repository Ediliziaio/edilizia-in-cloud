/**
 * Il popup «Importa XML o PDF»: logica pura, senza React né rete.
 *
 * Qui dentro c'è solo quello che si può provare senza un browser e senza
 * database: riconoscere il tipo di un file, dire quanto pesa, leggere dal
 * tracciato FatturaPA le quattro cose che servono a decidere (numero, data,
 * controparte, importi) e costruire l'elenco su cui si mettono le spunte.
 *
 * Nulla di tutto ciò è nuovo: l'espansione dei file e la direzione della
 * fattura stanno in bulkXmlImport, l'identità per il confronto dei doppioni in
 * importMassivo, la lettura del tracciato in _shared/fatturapaReader — lo
 * stesso lettore che gira sul server. Qui si mettono insieme.
 */

import { leggiFatturaPA } from "../../../supabase/functions/_shared/fatturapaReader";
import { senzaPrefissi } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import { classificaDirezione, type DirezioneFattura, type FileScartato, type XmlDaImportare } from "./bulkXmlImport";
import { chiaveEmessa, chiaveRicevuta, identitaFattura } from "./importMassivo";

export type TipoFileScelto = "xml" | "p7m" | "zip" | "pdf" | "ignoto";

/** Riconosce il tipo dall'estensione, come il resto dell'import: .XML maiuscolo compreso. */
export function riconosciTipoFile(nome: string): TipoFileScelto {
  const n = nome.toLowerCase().trim();
  if (n.endsWith(".p7m")) return "p7m";
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".zip")) return "zip";
  if (n.endsWith(".pdf")) return "pdf";
  return "ignoto";
}

/** Quello che l'utente legge accanto al nome del file. */
export function etichettaTipoFile(tipo: TipoFileScelto): string {
  switch (tipo) {
    case "xml": return "XML di fattura";
    case "p7m": return "XML firmato (p7m)";
    case "zip": return "Archivio zip";
    case "pdf": return "PDF";
    default: return "Non riconosciuto";
  }
}

/** «412 kB», «2,3 MB»: il peso come lo scrive il sistema operativo, in italiano. */
export function pesoLeggibile(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1).replace(".", ",") : Math.round(kb)} kB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} MB`;
}

/** Quel che il popup mostra per far decidere: senza questi non si importa alla cieca. */
export interface DatiLetti {
  numero: string;
  /** AAAA-MM-GG, come sta nel tracciato. */
  data: string;
  /** Il fornitore per una ricevuta, il cliente per una emessa. */
  soggetto: string;
  imponibile: number;
  iva: number;
  totale: number;
  direzione: DirezioneFattura;
}

/**
 * «completa» è la fattura che a sistema c'è già ma SENZA il suo file: la si
 * importa lo stesso, perché quello che succede è che la riga esistente riceve
 * l'XML (ricevi-sdi risponde duplicate + completed e attacca il file). Sono la
 * maggioranza di quelle registrate a mano o arrivate dai gestionali, e lasciarle
 * fuori per prudenza vorrebbe dire non completarle mai.
 */
export type StatoVoce = "pronta" | "completa" | "duplicata" | "errore";

/** Cosa c'è già a sistema: con il file (non serve rifarla) o senza (si completa). */
export interface GiaPresenti {
  /** Fatture complete di file: reimportarle non aggiunge niente. */
  conFile: ReadonlySet<string>;
  /** Fatture registrate senza file: l'import ci attacca l'originale. */
  senzaFile: ReadonlySet<string>;
}

export interface VoceImport {
  /** Stabile per tutta la vita del popup: le spunte si ricordano per id. */
  id: string;
  nome: string;
  origine: "xml" | "pdf";
  dati: DatiLetti | null;
  stato: StatoVoce;
  /** Perché non si importa, in una riga per chi guarda. Solo con stato «errore». */
  motivo?: string;
  /** Una riga di contesto quando si importa lo stesso (fattura da completare). */
  nota?: string;
  inclusa: boolean;
  xml?: XmlDaImportare;
  pdf?: File;
  /** Solo per i PDF: quel che ha letto l'AI e dove sta il file, per la scrittura. */
  letturaPdf?: { campi: Record<string, unknown>; percorso: string };
}

/**
 * Legge dal tracciato quello che serve all'anteprima. Ritorna null quando il
 * file non è una fattura leggibile: il motivo lo dà chi chiama, qui non si
 * indovina nulla.
 */
export function leggiDatiXml(contenuto: string, partitaIvaAzienda: string | null | undefined, parser: { parseFromString(xml: string, tipo: string): unknown }): DatiLetti | null {
  const direzione = classificaDirezione(contenuto, partitaIvaAzienda);
  const letta = leggiFatturaPA(senzaPrefissi(contenuto), parser as Parameters<typeof leggiFatturaPA>[1]);
  if (!letta) return null;
  return {
    numero: letta.numero,
    data: letta.data,
    // Su una emessa il fornitore è l'azienda stessa: il nome che dice qualcosa è il cliente.
    soggetto: direzione === "attiva" ? (letta.cliente.nome || letta.cedenteNome) : letta.cedenteNome,
    imponibile: letta.imponibile,
    iva: letta.imposta,
    totale: letta.totale,
    direzione,
  };
}

/** La chiave con cui si riconosce una fattura già a sistema: stesso numero e data dello stesso soggetto. */
export function chiaveFattura(contenuto: string, direzione: DirezioneFattura): string | null {
  const id = identitaFattura(contenuto);
  if (!id) return null;
  return direzione === "attiva" ? `E|${chiaveEmessa(id.numero, id.data)}` : chiaveRicevuta(id.cedente, id.numero, id.data);
}

/**
 * L'elenco su cui si mettono le spunte. Un file che non si legge diventa una
 * riga in errore, non ferma gli altri; una fattura già presente resta nella
 * lista ma SPENTA, perché reimportarla non serve e nasconderla farebbe credere
 * che il file non sia stato letto.
 */
export function costruisciVoci(
  xml: XmlDaImportare[],
  scartati: FileScartato[],
  partitaIvaAzienda: string | null | undefined,
  giaPresenti: GiaPresenti,
  parser: { parseFromString(xml: string, tipo: string): unknown },
): VoceImport[] {
  const voci: VoceImport[] = xml.map((f, i) => {
    const dati = leggiDatiXml(f.contenuto, partitaIvaAzienda, parser);
    if (!dati) {
      return { id: `xml-${i}`, nome: f.nome, origine: "xml", dati: null, stato: "errore", inclusa: false, xml: f,
        motivo: "Non è una fattura elettronica leggibile: manca l'intestazione o i dati del documento." };
    }
    if (dati.direzione === "incerta") {
      return { id: `xml-${i}`, nome: f.nome, origine: "xml", dati, stato: "errore", inclusa: false, xml: f,
        motivo: partitaIvaAzienda
          ? "Non risulta né emessa né ricevuta da questa azienda: controlla le partite IVA nel file."
          : "Partita IVA dell'azienda non impostata: senza non si distingue una fattura emessa da una ricevuta." };
    }
    const chiave = chiaveFattura(f.contenuto, dati.direzione);
    if (chiave !== null && giaPresenti.conFile.has(chiave)) {
      return { id: `xml-${i}`, nome: f.nome, origine: "xml", dati, stato: "duplicata", inclusa: false, xml: f };
    }
    if (chiave !== null && giaPresenti.senzaFile.has(chiave)) {
      return { id: `xml-${i}`, nome: f.nome, origine: "xml", dati, stato: "completa", inclusa: true, xml: f,
        nota: "Già registrata senza il file: importandola le si attacca l'originale." };
    }
    return { id: `xml-${i}`, nome: f.nome, origine: "xml", dati, stato: "pronta", inclusa: true, xml: f };
  });

  for (const [i, s] of scartati.entries()) {
    voci.push({ id: `scarto-${i}`, nome: s.nome, origine: "xml", dati: null, stato: "errore", motivo: s.motivo, inclusa: false });
  }
  return voci;
}

export interface ContoVoci {
  incluse: number;
  duplicate: number;
  /** Già a sistema ma senza file: si importano per attaccarglielo. */
  daCompletare: number;
  errori: number;
  importabili: number;
}

export function contaVoci(voci: readonly VoceImport[]): ContoVoci {
  return {
    incluse: voci.filter((v) => v.inclusa).length,
    duplicate: voci.filter((v) => v.stato === "duplicata").length,
    daCompletare: voci.filter((v) => v.stato === "completa").length,
    errori: voci.filter((v) => v.stato === "errore").length,
    importabili: voci.filter((v) => v.stato !== "errore").length,
  };
}

/** Si può spuntare tutto tranne quello che non si può importare. */
export function puoSpuntare(v: VoceImport): boolean {
  return v.stato !== "errore";
}

/**
 * L'ordine in cui si guarda un carico grosso: prima quello che si importa,
 * poi quello che c'è già, in fondo quello che non si legge. Dentro ogni
 * gruppo resta l'ordine dei file, che è quello in cui l'utente li ha scelti.
 */
export function ordinaVoci(voci: readonly VoceImport[]): VoceImport[] {
  const peso = (v: VoceImport) => (v.stato === "pronta" ? 0 : v.stato === "completa" ? 1 : v.stato === "duplicata" ? 2 : 3);
  return [...voci].sort((a, b) => peso(a) - peso(b));
}

/** Il filtro della casella di ricerca: numero, soggetto o nome del file. */
export function filtraVoci(voci: readonly VoceImport[], cerca: string): VoceImport[] {
  const q = cerca.trim().toLowerCase();
  if (!q) return [...voci];
  return voci.filter((v) =>
    v.nome.toLowerCase().includes(q) ||
    (v.dati?.numero ?? "").toLowerCase().includes(q) ||
    (v.dati?.soggetto ?? "").toLowerCase().includes(q));
}
