/**
 * Il listino di una ditta da un file (10/11/2026, lotto 7 di docs/piano-subappalto-computo-listino.md).
 *
 * La ditta manda il suo listino in Excel, CSV o PDF: codice, descrizione, unità, prezzo. Qui:
 *   1. le righe dalla tabella: si cerca l'intestazione (descrizione e prezzo; codice e unità se ci sono);
 *   2. per ogni riga la voce del listino aziendale a cui va il prezzo: stesso codice, poi stesso nome;
 *      altrimenti diventa una voce sua della ditta; con l'unità diversa non si abbina mai da sola;
 *   3. il controllo dei prezzi fuori scala (rischio R17): meno di un quinto o più di cinque volte il
 *      costo nostro sulla voce. Un PDF letto male («1.250,00» letto 1,25) finisce qui: la riga
 *      resta fuori finché qualcuno non la sceglie a mano.
 * Le voci proprie delle altre ditte non si propongono mai. Tutto puro: niente rete, verificabile dai test.
 */
import { normalizeDecimalSeparators } from "@/lib/parseDecimalIT";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { chiaveDescrizione, chiaveSimile, unitaDelListino, type VoceListinoAbbinabile } from "./abbinamentoListino";

export interface RigaListinoImportata {
  /** Numero della riga nel file, per ritrovarla. */
  riga: number;
  codice: string | null;
  descrizione: string;
  unita: string | null;
  prezzo: number | null;
}

export type SceltaImport = { tipo: "voce"; tariffaId: string } | { tipo: "nuova" } | { tipo: "salta" };

export interface PropostaImport {
  riga: RigaListinoImportata;
  scelta: SceltaImport;
  motivo: "codice" | "nome" | "simile" | null;
  /** Perché la riga non entra da sola (o cosa guardare). */
  avviso: string | null;
  /** Il prezzo è fuori scala rispetto al costo nostro sulla voce trovata. */
  fuoriScala: boolean;
}

export type VoceListinoConCosto = VoceListinoAbbinabile & { costo: number | null };

const testoCella = (v: unknown): string => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
const intestazione = (v: unknown) => testoCella(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Un numero scritto all'italiana o all'inglese, con o senza €; null se non è un numero. */
export function numeroListino(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // «30,00 €/mq», «€/mq 12,50», «12,5 euro», «12,50 + IVA», «12,50 cad»: la cifra c'è, il resto è contorno.
  // Un intervallo («15-40», «da 15 a 40») non è un prezzo: resta vuoto e si vede.
  const s = testoCella(v).replace(/\s|€|euro|eur/gi, "")
    .replace(/\+?iva(esclusa|inclusa)?\.?$/i, "")
    .replace(/^\/[a-z²³.]+(?=\d)/i, "")
    .replace(/\/[a-z0-9²³.]+$/i, "")
    .replace(/(cadauno|cadauna|cad|pz|nr|mq|ml|mc|kg|ora|ore|h)\.?$/i, "");
  if (!/^-?\d[\d.,]*$/.test(s)) return null;
  const n = Number(normalizeDecimalSeparators(s));
  return Number.isFinite(n) ? n : null;
}

type Colonne = { descrizione: number; prezzo: number; codice: number | null; unita: number | null };

function colonneDa(riga: unknown[]): Colonne | null {
  const h = riga.map(intestazione);
  const trova = (re: RegExp, salta: number[] = []) => h.findIndex((t, i) => !salta.includes(i) && re.test(t));
  /** La prima colonna che risponde, provando dalla regola più precisa alla più larga. */
  const inOrdine = (regole: RegExp[], salta: number[]) => {
    for (const re of regole) { const i = trova(re, salta); if (i >= 0) return i; }
    return -1;
  };
  const unita = trova(/^(u\.?\s*m\.?|um|unita'?( di misura)?|misura|u\.?\s*d\.?\s*m\.?)$/);
  // Le colonne di materiali, totali e quantità non sono mai il prezzo della ditta.
  const nonPrezzo = h.flatMap((t, i) => (/material|totale|^importo$|quantit/.test(t) ? [i] : []));
  const prezzo = inOrdine([
    /prezzo.*(posa|manodopera|lavoro)/, /prezzo|^p\.?\s*u\.?$|unitari/, /tariffa unit/, /costo/, /euro|€/, /importo unit/,
  ], [unita, ...nonPrezzo]);
  // «Articolo» e «Voce» sono la descrizione solo se una colonna che lo dice davvero non c'è.
  const descrizione = inOrdine([
    /descri|designaz|denominaz/, /lavor|prestazion|oggetto|intervento/, /voce|articolo/,
  ], [unita, prezzo]);
  if (descrizione < 0 || prezzo < 0) return null;
  const codice = trova(/^(cod(ice)?\.?|art(icolo)?\.?(\s*n\.?)?|n\.?\s*art\.?|rif(erimento)?\.?|tariffa|voce n\.?|n\.?|n°|nr\.?)$|^cod/, [unita, prezzo, descrizione]);
  return { descrizione, prezzo, codice: codice >= 0 ? codice : null, unita: unita >= 0 ? unita : null };
}

/**
 * Le righe del listino da una tabella (righe × celle). L'intestazione si cerca nelle prime 30 righe;
 * le righe senza descrizione si saltano, quelle senza prezzo restano (si vede cosa manca).
 */
export function righeDaTabella(tabella: ReadonlyArray<ReadonlyArray<unknown>>): { righe: RigaListinoImportata[]; errore: string | null } {
  let colonne: Colonne | null = null;
  let inizio = -1;
  for (let i = 0; i < Math.min(30, tabella.length); i++) {
    colonne = colonneDa([...(tabella[i] ?? [])]);
    if (colonne) { inizio = i + 1; break; }
  }
  if (!colonne) return { righe: [], errore: "Nel file non ho trovato l'intestazione del listino: servono almeno una colonna «Descrizione» e una «Prezzo»." };
  const c = colonne;
  const righe: RigaListinoImportata[] = [];
  for (let i = inizio; i < tabella.length; i++) {
    const r = tabella[i] ?? [];
    const descrizione = testoCella(r[c.descrizione]);
    if (descrizione.length < 2) continue;
    // I totali e le note in fondo non sono voci: «Totale» col suo importo diventava una voce della ditta.
    if (/^(sub\s*)?tot(ale|\.)|^note?\b|^iva\b/i.test(descrizione)) continue;
    const unita = c.unita != null ? testoCella(r[c.unita]) || null : null;
    const prezzo = numeroListino(r[c.prezzo]);
    // I titoli di sezione («OPERE MURARIE»): niente prezzo, niente unità.
    if (prezzo == null && !unita && (c.unita != null || descrizione === descrizione.toUpperCase())) continue;
    righe.push({
      riga: i + 1,
      codice: c.codice != null ? testoCella(r[c.codice]) || null : null,
      descrizione: descrizione.slice(0, 2000),
      unita,
      prezzo,
    });
  }
  if (!righe.length) return { righe, errore: "L'intestazione c'è, ma sotto non ci sono righe con una descrizione." };
  return { righe, errore: null };
}

/** Fuori scala: meno di un quinto o più di cinque volte il costo nostro sulla voce (R17). */
export function prezzoFuoriScala(prezzo: number | null, costoNostro: number | null | undefined): boolean {
  if (prezzo == null || !costoNostro || costoNostro <= 0) return false;
  return prezzo < costoNostro / 5 || prezzo > costoNostro * 5;
}

/** Per ogni riga del file: a quale voce va il prezzo, o se diventa una voce sua della ditta. */
export function proponiImport(
  righe: ReadonlyArray<RigaListinoImportata>,
  listino: ReadonlyArray<VoceListinoConCosto>,
  anagraficaId: string,
  squadraId: string | null = null,
): PropostaImport[] {
  // Le voci dell'azienda e quelle di questa ditta (per ricaricare il suo listino); mai quelle delle altre ditte.
  const candidate = listino.filter((t) => (!t.subappaltatore_id && !t.external_team_id)
    || t.subappaltatore_id === anagraficaId || (!!squadraId && t.external_team_id === squadraId));
  const perCodice = new Map<string, VoceListinoConCosto[]>();
  const perNome = new Map<string, VoceListinoConCosto[]>();
  const perSimile = new Map<string, VoceListinoConCosto[]>();
  for (const t of candidate) {
    const sim = chiaveSimile(t.nome);
    if (sim) perSimile.set(sim, [...(perSimile.get(sim) ?? []), t]);
    if (t.codice?.trim()) { const k = t.codice.trim().toLowerCase(); perCodice.set(k, [...(perCodice.get(k) ?? []), t]); }
    const n = chiaveDescrizione(t.nome);
    if (n) perNome.set(n, [...(perNome.get(n) ?? []), t]);
  }
  const usate = new Set<string>();
  return righe.map((riga): PropostaImport => {
    if (riga.prezzo == null) return { riga, scelta: { tipo: "salta" }, motivo: null, avviso: "Senza prezzo", fuoriScala: false };
    if (riga.prezzo < 0) return { riga, scelta: { tipo: "salta" }, motivo: null, avviso: "Prezzo negativo", fuoriScala: false };
    const perCod = riga.codice ? perCodice.get(riga.codice.trim().toLowerCase()) ?? [] : [];
    const perNom = perNome.get(chiaveDescrizione(riga.descrizione)) ?? [];
    // «Posa di finestre singole» è «Posa finestra singola»: si propone, e lo dice.
    const perSim = perCod.length === 0 && perNom.length === 0 ? perSimile.get(chiaveSimile(riga.descrizione)) ?? [] : [];
    const [trovata, motivo] = perCod.length === 1 ? [perCod[0], "codice" as const]
      : perNom.length === 1 ? [perNom[0], "nome" as const]
      : perSim.length === 1 ? [perSim[0], "simile" as const] : [null, null];
    if (!trovata) {
      const ambigua = perCod.length > 1 || perNom.length > 1 || perSim.length > 1;
      return { riga, scelta: ambigua ? { tipo: "salta" } : { tipo: "nuova" }, motivo: null, avviso: ambigua ? "Più voci con lo stesso codice o nome: scegli tu" : null, fuoriScala: false };
    }
    if (riga.unita && !unitaCompatibili(riga.unita, unitaDelListino(trovata.unita))) {
      return { riga, scelta: { tipo: "salta" }, motivo, avviso: `Unità diversa (${riga.unita} contro ${unitaDelListino(trovata.unita)}): scegli tu`, fuoriScala: false };
    }
    if (usate.has(trovata.id)) {
      return { riga, scelta: { tipo: "salta" }, motivo, avviso: "Un'altra riga del file va già su questa voce", fuoriScala: false };
    }
    const fuoriScala = prezzoFuoriScala(riga.prezzo, trovata.costo);
    if (fuoriScala) return { riga, scelta: { tipo: "salta" }, motivo, avviso: "Prezzo fuori scala rispetto al costo nostro: controlla il file", fuoriScala: true };
    usate.add(trovata.id);
    return { riga, scelta: { tipo: "voce", tariffaId: trovata.id }, motivo, avviso: motivo === "simile" ? `Nome simile a «${trovata.nome}»: controlla` : null, fuoriScala: false };
  });
}

/**
 * Cosa salvare: le voci sue da creare e i prezzi da mandare a `listino_ditta_salva`. Due righe sulla
 * stessa voce sono un errore (quale prezzo vale?), come una voce sua senza unità riconosciuta.
 */
export function daSalvareImport(
  proposte: ReadonlyArray<PropostaImport>,
  unitaRiconosciuta: (u: string | null) => boolean,
): { prezzi: Array<{ tariffa_id: string; costo: number }>; nuove: RigaListinoImportata[]; errori: string[] } {
  const prezzi: Array<{ tariffa_id: string; costo: number }> = [];
  const nuove: RigaListinoImportata[] = [];
  const errori: string[] = [];
  const viste = new Map<string, number>();
  for (const p of proposte) {
    if (p.scelta.tipo === "salta" || p.riga.prezzo == null || p.riga.prezzo < 0) continue;
    if (p.scelta.tipo === "nuova") {
      if (!unitaRiconosciuta(p.riga.unita)) errori.push(`Riga ${p.riga.riga}: unità «${p.riga.unita ?? ""}» non riconosciuta per una voce nuova.`);
      else nuove.push(p.riga);
      continue;
    }
    const prima = viste.get(p.scelta.tariffaId);
    if (prima != null) { errori.push(`Righe ${prima} e ${p.riga.riga}: due prezzi sulla stessa voce.`); continue; }
    viste.set(p.scelta.tariffaId, p.riga.riga);
    prezzi.push({ tariffa_id: p.scelta.tariffaId, costo: Math.round(p.riga.prezzo * 10000) / 10000 });
  }
  return { prezzi, nuove, errori };
}

/** La tabella da un file Excel (primo foglio con un'intestazione di listino) o CSV. */
export async function tabellaDaFile(file: File): Promise<unknown[][]> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".tsv") || file.type === "text/csv") {
    const testo = new TextDecoder("utf-8").decode(await file.arrayBuffer()).replace(/^\uFEFF/, "");
    const linee = testo.split(/\r?\n/).filter((l) => l.trim());
    const prima = linee[0] ?? "";
    const sep = nome.endsWith(".tsv") || prima.includes("\t") ? "\t" : (prima.split(";").length >= prima.split(",").length ? ";" : ",");
    return linee.map((l) => dividiCsv(l, sep));
  }
  if (nome.endsWith(".xlsx") || nome.endsWith(".xlsm")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    let primo: unknown[][] | null = null;
    for (const ws of wb.worksheets) {
      const righe: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const valori = (row.values as unknown[]).slice(1).map(valoreCella);
        righe.push(valori);
      });
      primo ??= righe;
      if (righeDaTabella(righe).righe.length) return righe;
    }
    return primo ?? [];
  }
  throw new Error("Questo file si legge con l'AI: vanno bene Excel (.xlsx) e CSV, o un PDF.");
}

function valoreCella(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (o.result !== undefined) return o.result;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
  }
  return v;
}

function dividiCsv(linea: string, sep: string): string[] {
  const out: string[] = [];
  let campo = "";
  let virgolette = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === "\"") {
      if (virgolette && linea[i + 1] === "\"") { campo += "\""; i++; } else virgolette = !virgolette;
    } else if (ch === sep && !virgolette) { out.push(campo); campo = ""; } else campo += ch;
  }
  out.push(campo);
  return out;
}
