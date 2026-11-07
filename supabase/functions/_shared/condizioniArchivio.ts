/**
 * L'archivio «Contratti e condizioni» letto dalle edge function (07/11/2026).
 *
 * Stesse regole del codice del browser (`src/lib/condizioni/archivio.ts`), ridotte a quello che
 * serve qui: il modello predefinito di un ambito, il suo testo, e da dove viene.
 *
 * Perché serve: un contratto d'appalto scritto dall'AI inventava garanzia, penali e foro anche
 * quando l'azienda le aveva già scritte. Le clausole dell'azienda non si riscrivono: si riportano.
 */

import { contrattoInHtml, leggiTestoRiccoContratto } from "./testoRiccoContratto.ts";
import { condizioniTolteDalPdf } from "./condizioniDelPreventivo.ts";

export type AmbitoCondizioni =
  | "preventivo" | "appalto" | "commessa" | "subappalto"
  | "acquisto" | "fattura" | "manutenzione" | "lavoro";

export interface ClausolaArchivio {
  titolo?: string | null;
  testo?: string | null;
  /** Da approvare specificamente per iscritto (art. 1341 c.c.). */
  vessatoria?: boolean | null;
}

export interface ModelloArchivio {
  id: string;
  nome: string;
  ambito: string;
  predefinito?: boolean | null;
  attivo?: boolean | null;
  versione?: number | null;
  clausole?: ClausolaArchivio[] | null;
}

/** Da dove vengono le condizioni di un documento: resta scritto sul documento, non cambia più. */
export interface OrigineCondizioni {
  modello_id: string;
  modello_nome: string;
  versione: number;
  congelate_il: string;
}

/** Testo vero: non vuoto una volta tolti tag e spazi insulsi. */
export const haParole = (v: unknown): boolean =>
  String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;

/**
 * Il testo semplice di una clausola, per chi non stampa un PDF: la causale della fattura (che va
 * nell'XML), il prompt dell'AI, un riassunto a schermo. Dall'editor arriva HTML: qui i tag diventano
 * a capo e spariscono, e le entità tornano caratteri.
 */
export function testoPiano(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/tr|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&(?:quot|#34);/g, '"').replace(/&(?:apos|#39);/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const senzaFronzoli = (v: string): string =>
  testoPiano(v).replace(/^#{1,6}\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();

const eHtml = (t: string): boolean => /<(?:p|h[1-6]|div|ul|ol|li|br|span|strong|em)\b/i.test(t);

/** La prima riga del testo, e se è un titolo: funziona sia col Markdown importato sia con l'HTML dell'editor. */
function primaRiga(testo: string): { testo: string; eTitolo: boolean } {
  const t = testo.trim();
  if (eHtml(t)) {
    const blocco = /^<(h[1-6]|p|div|li)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(t);
    if (blocco) return { testo: senzaFronzoli(blocco[2]), eTitolo: /^h/i.test(blocco[1]) };
  }
  const riga = t.split("\n").find((r) => haParole(r)) ?? "";
  return { testo: senzaFronzoli(riga), eTitolo: /^#{1,6}\s/.test(riga.trim()) };
}

/** Il titolo si ripete già nella prima riga del testo? Allora non si stampa due volte. */
export function titoloGiaNelTesto(titolo: string, testo: string): boolean {
  return primaRiga(testo).testo === senzaFronzoli(titolo);
}

/**
 * Il titolo della clausola si stampa? No se il testo si apre già con quello; e no se il modello è un
 * contratto intero importato (una clausola sola) che si apre col suo titolo: «Condizioni generali»
 * sopra «Condizioni contrattuali» è il titolo doppio che si vedeva nel PDF (07/11/2026).
 */
function siStampaIlTitolo(c: ClausolaArchivio, quante: number): boolean {
  const titolo = (c.titolo ?? "").trim();
  const testo = (c.testo ?? "").trim();
  if (!haParole(titolo)) return false;
  if (!haParole(testo)) return true;
  if (titoloGiaNelTesto(titolo, testo)) return false;
  return !(quante === 1 && primaRiga(testo).eTitolo);
}

export function clausoleBuone(modello: ModelloArchivio | null | undefined): ClausolaArchivio[] {
  return (modello?.clausole ?? []).filter((c) => haParole(c?.titolo) || haParole(c?.testo));
}

/** Il testo del modello da leggere, senza formattazione: per l'AI, per un riassunto, per un controllo. */
export function testoDelModello(modello: ModelloArchivio | null | undefined): string {
  const clausole = clausoleBuone(modello);
  return clausole
    .map((c) => {
      const titolo = (c.titolo ?? "").trim();
      const testo = testoPiano(c.testo);
      return (siStampaIlTitolo(c, clausole.length) ? [titolo, testo] : [testo]).filter(haParole).join("\n");
    })
    .filter(haParole)
    .join("\n\n");
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Un testo Markdown in HTML che il PDF rilegge uguale. `contrattoInHtml` scrive gli elenchi come
 * paragrafi con «• » davanti: per il PDF non sono più elenchi, e l'elenco delle clausole da approvare
 * con la seconda firma spariva (07/11/2026, prova sulle condizioni di serramenti di un cliente: 9 → 0).
 * Qui gli elementi d'elenco restano `<li>`.
 */
function markdownInHtmlFedele(testo: string): string {
  return leggiTestoRiccoContratto(testo)
    .map((r) => {
      if (r.tipo !== "li") return contrattoInHtml([r]);
      const p = contrattoInHtml([{ ...r, tipo: "p" }]);
      return `<ul>${p.replace(/^<p(\b[^>]*)>/, "<li$1>").replace(/<\/p>$/, "</li>")}</ul>`;
    })
    .join("");
}

const PARAGRAFO_1341 = /(^|\n)\s*#{1,4}\s[^\n]*(1341|approvare specificamente)|<h[1-6][^>]*>[^<]*(1341|approvare specificamente)/i;

/**
 * Il modello come va nel PDF.
 *
 * La regola che conta è una: il PDF deve leggere le stesse righe che leggeva prima. Per questo:
 *  · clausole tutte in Markdown (i contratti importati, i testi di serie) → si compongono in Markdown,
 *    COSÌ COME SONO: un modello di una clausola sola stampa esattamente il testo di prima;
 *  · se c'è HTML (scritto con l'editor) → si compone in HTML, e il Markdown delle altre clausole passa da
 *    `markdownInHtmlFedele`, che tiene gli elenchi.
 * Provato riga per riga sui contratti veri di quattro aziende (07/11/2026).
 */
export function htmlDelModello(modello: ModelloArchivio | null | undefined): string {
  const clausole = clausoleBuone(modello);
  const daApprovare = titoliVessatorie(modello);

  if (!clausole.some((c) => eHtml(String(c.testo ?? "")))) {
    const md = clausole
      .map((c) => {
        // Il PDF toglie i tag anche dal Markdown: «<IVA>» in un titolo sparirebbe. Scritto come entità, resta.
        const titolo = escapeHtml((c.titolo ?? "").replace(/\s+/g, " ").trim());
        const testo = (c.testo ?? "").trim();
        return [siStampaIlTitolo(c, clausole.length) ? `## ${titolo}` : "", testo].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
    // Le clausole segnate «da approvare a parte» (art. 1341 c.c.): il PDF le porta nella pagina della firma
    // quando trova questo paragrafo (`clausoleDaApprovare` in adattatoreEdile). Se il testo ce l'ha già, no.
    if (!daApprovare.length || PARAGRAFO_1341.test(md)) return md;
    return `${md}\n\n## Clausole da approvare specificamente (art. 1341 c.c.)\n${daApprovare.map((t) => `- ${escapeHtml(t)}`).join("\n")}`;
  }

  const html = clausole
    .map((c) => {
      const titolo = (c.titolo ?? "").trim();
      const testo = (c.testo ?? "").trim();
      const corpo = haParole(testo) ? (eHtml(testo) ? testo : markdownInHtmlFedele(testo)) : "";
      return `${siStampaIlTitolo(c, clausole.length) ? `<h2>${escapeHtml(titolo)}</h2>` : ""}${corpo}`;
    })
    .join("");
  if (!daApprovare.length || PARAGRAFO_1341.test(html)) return html;
  return `${html}<h2>Clausole da approvare specificamente (art. 1341 c.c.)</h2><ul>${
    daApprovare.map((t) => `<li>${escapeHtml(t)}</li>`).join("")
  }</ul>`;
}

/**
 * Le condizioni dell'azienda in coda a un contratto in Markdown, parola per parola (07/11/2026).
 *
 * Il contratto d'appalto lo scrive l'AI, ma le clausole che l'azienda ha già scritto NON le deve
 * riscrivere: chiederglielo allungava il contratto oltre i limiti (risposta tagliata, poi timeout) e non
 * garantiva il testo esatto. Le attacca il sistema: titolo e testo di ogni clausola, e in fondo l'elenco
 * di quelle da approvare a parte con la seconda firma (art. 1341 c.c.).
 */
export function condizioniInCodaAlContratto(modello: ModelloArchivio | null | undefined): string {
  const clausole = clausoleBuone(modello);
  if (!clausole.length) return "";
  // I titoli del testo importato scendono di livello: stanno dentro «Condizioni generali dell'impresa».
  const abbassa = (t: string) => t.replace(/^\s*#{1,6}\s+/gm, "#### ");
  const corpo = clausole.map((c) => {
    const titolo = (c.titolo ?? "").replace(/\s+/g, " ").trim();
    const testo = abbassa(testoPiano(c.testo));
    const conTitolo = titolo && !titoloGiaNelTesto(titolo, String(c.testo ?? ""));
    return [conTitolo ? `### ${titolo}` : "", testo].filter(Boolean).join("\n");
  }).join("\n\n");
  const daApprovare = titoliVessatorie(modello);
  const firma = daApprovare.length
    ? `\n\n## Clausole da approvare specificamente (art. 1341 c.c.)\nIl Committente dichiara di approvare specificamente, ai sensi degli artt. 1341 e 1342 c.c., le seguenti clausole delle Condizioni generali dell'impresa:\n${daApprovare.map((t) => `- ${t}`).join("\n")}`
    : "";
  return `${TITOLO_CONDIZIONI_CONTRATTO}\n${corpo}${firma}`;
}

/** Il titolo con cui le condizioni dell'azienda si attaccano in fondo al contratto d'appalto. */
export const TITOLO_CONDIZIONI_CONTRATTO = "## Condizioni generali dell'impresa";

/**
 * La parte del contratto che viene dall'archivio: dal titolo «Condizioni generali dell'impresa» in fondo.
 * Serve a capire se qualcuno l'ha cambiata a mano. Vuota se il contratto non le ha.
 */
export function condizioniDelContratto(md: string | null | undefined): string {
  const testo = String(md ?? "");
  const i = testo.indexOf(TITOLO_CONDIZIONI_CONTRATTO);
  return i < 0 ? "" : testo.slice(i).replace(/\s+/g, " ").trim();
}

/** Un modello scelto a mano per un documento: solo se è di quell'azienda, attivo, di quell'ambito e con del testo. */
export async function modelloDellAzienda(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  ambito: AmbitoCondizioni,
  id: string,
): Promise<ModelloArchivio | null> {
  try {
    const { data, error } = await supabase
      .from("condizioni_modelli")
      .select("id,nome,ambito,predefinito,attivo,versione,clausole")
      .eq("company_id", companyId)
      .eq("ambito", ambito)
      .eq("id", id)
      .eq("attivo", true)
      .maybeSingle();
    if (error || !data) return null;
    return haParole(testoDelModello(data as ModelloArchivio)) ? (data as ModelloArchivio) : null;
  } catch {
    return null;
  }
}

/** Da dove sono venute le condizioni stampate. */
export type FonteCondizioniPdf =
  | "documento" | "fissate" | "associato" | "predefinito" | "modulo" | "sistema" | "nessuna";

/**
 * Il documento è già partito? Tutto ciò che non è più una bozza: inviato, accettato, convertito,
 * scaduto, rifiutato, da consegnare… Un documento partito non legge più l'archivio dal vivo.
 */
export function documentoPartito(stato: unknown): boolean {
  const s = String(stato ?? "").trim().toLowerCase();
  return s.length > 0 && s !== "bozza" && s !== "draft";
}

/** La versione fissata sul documento, se `condizioni_origine` ne indica una. */
export function versioneFissata(origine: unknown): { modello_id: string; versione: number } | null {
  if (!origine || typeof origine !== "object") return null;
  const o = origine as Record<string, unknown>;
  const id = typeof o.modello_id === "string" ? o.modello_id : null;
  const v = Number(o.versione);
  return id && Number.isInteger(v) && v > 0 ? { modello_id: id, versione: v } : null;
}

/**
 * LA regola: quali condizioni stampa un PDF (07/11/2026). Una sola, per i preventivatori nel browser e
 * per il preventivo generico sul server. Florin: «le definisco in Contratti e condizioni e le associo:
 * non le devo modificare da altre parti»; e «non devi perdere i contratti di Renova e di Dimora Torino».
 *
 *  1. la copia del documento — scritta per quel cliente: vince sempre;
 *  2. la versione dell'archivio fissata quando il documento è partito (`condizioni_origine`): la sua
 *     fotografia in `condizioni_modelli_versioni`. Il modello può cambiare dieci volte, il documento
 *     mandato resta com'era;
 *  — un documento già partito senza versione fissata (tutti quelli mandati prima di oggi) NON legge
 *    l'archivio: scende al punto 4 e stampa quello che stampava;
 *  3. per le bozze, il modello dell'archivio associato a quel modulo, e poi il predefinito;
 *  4. il testo che il modulo aveva già — la rete per chi l'archivio non l'ha ancora usato. La regola è
 *     quella di prima, carattere per carattere: un testo non vuoto dopo il trim vale;
 *  5. il testo di sistema del settore.
 */
export function condizioniDelPdf(f: {
  copiaDelDocumento?: string | null;
  /** La fotografia della versione indicata da `condizioni_origine`, già caricata. */
  fissate?: ModelloArchivio | null;
  /** Lo stato del documento non è più «bozza». */
  partito?: boolean;
  modelloAssociato?: ModelloArchivio | null;
  predefinito?: ModelloArchivio | null;
  testoDelModulo?: string | null;
  testoDiSistema?: string | null;
}): { testo: string; fonte: FonteCondizioniPdf; modello: ModelloArchivio | null } {
  if (haParole(f.copiaDelDocumento)) return { testo: String(f.copiaDelDocumento), fonte: "documento", modello: null };
  if (f.fissate && haParole(testoDelModello(f.fissate))) {
    return { testo: htmlDelModello(f.fissate), fonte: "fissate", modello: f.fissate };
  }
  const dalVivo: ReadonlyArray<readonly [ModelloArchivio | null | undefined, "associato" | "predefinito"]> =
    f.partito ? [] : [[f.modelloAssociato, "associato"], [f.predefinito, "predefinito"]];
  for (const [m, fonte] of dalVivo) {
    if (m && m.attivo !== false && haParole(testoDelModello(m))) {
      return { testo: htmlDelModello(m), fonte, modello: m };
    }
  }
  // Come prima: `String(t.condizioni_legali_testo ?? "").trim() || condizioniStandard(...)` — il testo del
  // modulo esce senza spazi in testa e in coda, quello di sistema così com'è.
  const delModulo = String(f.testoDelModulo ?? "").trim();
  if (delModulo) return { testo: delModulo, fonte: "modulo", modello: null };
  if (String(f.testoDiSistema ?? "").trim()) return { testo: String(f.testoDiSistema), fonte: "sistema", modello: null };
  return { testo: "", fonte: "nessuna", modello: null };
}

/** Le clausole che il committente deve approvare a parte (art. 1341 c.c.), coi loro titoli. */
export function titoliVessatorie(modello: ModelloArchivio | null | undefined): string[] {
  return clausoleBuone(modello)
    .filter((c) => c.vessatoria === true)
    .map((c) => (c.titolo ?? "").trim())
    .filter((t) => t.length > 0);
}

export function origineDelModello(modello: ModelloArchivio, adesso = new Date().toISOString()): OrigineCondizioni {
  return {
    modello_id: modello.id,
    modello_nome: modello.nome,
    versione: Number(modello.versione ?? 1),
    congelate_il: adesso,
  };
}

/**
 * Dove il caricatore appoggia, sul modello del PDF, quello che serve dall'archivio. Sta sul modello
 * stesso così le strade che arrivano al documento — preventivatori, anteprime, il bot WhatsApp — lo
 * portano con sé senza cambiare firma.
 */
export const CHIAVE_ARCHIVIO = "__condizioni_archivio" as const;

/** Quello che dall'archivio serve a un documento per decidere le sue condizioni. */
export interface ArchivioDelDocumento {
  associato: ModelloArchivio | null;
  predefinito: ModelloArchivio | null;
  fissate: ModelloArchivio | null;
}

const NIENTE: ArchivioDelDocumento = { associato: null, predefinito: null, fissate: null };

/**
 * Carica dall'archivio quello che serve a un documento, in due letture al massimo. Lo usano il
 * browser (preventivatori) e il server (preventivo generico): stessa lettura, stesso risultato.
 * Se le tabelle non ci sono o la lettura fallisce, torna «niente» e il documento esce come prima.
 */
export async function caricaArchivioDelDocumento(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string | null | undefined,
  quale: { ambito?: AmbitoCondizioni; associatoId?: string | null; origine?: unknown },
): Promise<ArchivioDelDocumento> {
  if (!companyId) return NIENTE;
  const ambito = quale.ambito ?? "preventivo";
  try {
    const fissata = versioneFissata(quale.origine);
    const [modelli, versione] = await Promise.all([
      // Tutti, anche gli archiviati: un documento partito con un modello poi archiviato deve
      // continuare a stamparlo. Per associato e predefinito contano solo gli attivi.
      supabase.from("condizioni_modelli")
        .select("id,nome,ambito,predefinito,attivo,versione,clausole")
        .eq("company_id", companyId),
      fissata
        ? supabase.from("condizioni_modelli_versioni")
          .select("modello_id,versione,nome,clausole")
          .eq("modello_id", fissata.modello_id).eq("versione", fissata.versione).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const tutti = (modelli?.error ? [] : (modelli?.data ?? [])) as ModelloArchivio[];
    const attivi = tutti.filter((m) => m.attivo !== false);
    const v = versione?.error ? null : versione?.data as { modello_id: string; versione: number; nome: string; clausole: ClausolaArchivio[] } | null;
    // La fotografia vale solo se è di un modello di questa azienda: sul server non c'è RLS a fermarla.
    const suaDellAzienda = !!v && tutti.some((m) => m.id === v.modello_id);
    return {
      associato: quale.associatoId ? attivi.find((m) => m.id === quale.associatoId) ?? null : null,
      predefinito: attivi.find((m) => m.ambito === ambito && m.predefinito) ?? null,
      fissate: v && suaDellAzienda
        ? { id: v.modello_id, nome: v.nome, ambito, versione: v.versione, attivo: true, clausole: v.clausole }
        : null,
    };
  } catch {
    return NIENTE;
  }
}

/**
 * Per i server che impaginano da soli (fotovoltaico, serramenti): la regola intera, archivio compreso.
 * Sostituisce `testoCondizioniDelPdf(progetto, template.condizioni_legali_testo.trim() || standard)`,
 * che era la stessa riga scritta in ognuno: un preventivo impostato «senza condizioni» resta senza.
 */
export async function condizioniDelPreventivoDalServer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  progetto: {
    company_id?: string | null; stato?: unknown; condizioni_nel_pdf?: boolean | null;
    condizioni_testo?: string | null; condizioni_origine?: unknown;
  },
  template: { condizioni_legali_testo?: string | null; condizioni_modello_id?: unknown } | null | undefined,
  testoDiSistema: string,
): Promise<string> {
  if (condizioniTolteDalPdf(progetto)) return "";
  const archivio = await caricaArchivioDelDocumento(supabase, progetto.company_id, {
    associatoId: typeof template?.condizioni_modello_id === "string" ? template.condizioni_modello_id : null,
    origine: progetto.condizioni_origine,
  });
  return condizioniDelPdf({
    copiaDelDocumento: progetto.condizioni_testo,
    fissate: archivio.fissate,
    partito: documentoPartito(progetto.stato),
    modelloAssociato: archivio.associato,
    predefinito: archivio.predefinito,
    testoDelModulo: template?.condizioni_legali_testo,
    testoDiSistema,
  }).testo;
}

/**
 * Il modello predefinito dell'azienda per un ambito. Se l'archivio non c'è ancora, o l'azienda non ha
 * scritto niente, torna null e il documento esce come prima: niente si rompe per chi non lo usa.
 */
export async function modelloPredefinitoDellAzienda(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  ambito: AmbitoCondizioni,
): Promise<ModelloArchivio | null> {
  try {
    const { data, error } = await supabase
      .from("condizioni_modelli")
      .select("id,nome,ambito,predefinito,attivo,versione,clausole")
      .eq("company_id", companyId)
      .eq("ambito", ambito)
      .eq("predefinito", true)
      .eq("attivo", true)
      .maybeSingle();
    if (error || !data) return null;
    return haParole(testoDelModello(data as ModelloArchivio)) ? (data as ModelloArchivio) : null;
  } catch {
    return null;
  }
}
