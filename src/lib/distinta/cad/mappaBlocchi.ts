/**
 * «Nome del blocco → simbolo»: l'azienda lo decide una volta (tabella
 * dwg_mappa_blocchi) e i disegni successivi si contano da soli. Per i blocchi
 * mai visti si propone un simbolo dal nome (PRESA_10A → «Punto presa 10A»):
 * è solo un suggerimento, lo conferma chi conta.
 *
 * Regole pure: nessun accesso al database.
 */
import type { LunghezzaMisurata, SimboloCad } from "./contaDisegno";
import { SENZA_LOCALE } from "./contaDisegno";

export interface VoceMappa {
  nome_blocco: string;
  simbolo: string;
  descrizione: string | null;
  scomposizione_id: string | null;
  ignora: boolean;
}

/** Il nome come lo salva il database: maiuscolo, senza spazi ai lati. */
export const normalizzaNomeBlocco = (nome: string) => nome.trim().toUpperCase();

const REGOLE: { re: RegExp; simbolo: string }[] = [
  { re: /RIVEL|RILEV|SMOKE|FUMO|DETECT/, simbolo: "Rilevatore fumo" },
  { re: /PULS.*ALL|MCP|ALLARME|SIRENA|PANNELLO.?OTT/, simbolo: "Pulsante / segnalatore allarme" },
  { re: /ESTINT/, simbolo: "Estintore" },
  { re: /IDRANT|NASPO|UNI.?45|UNI.?70/, simbolo: "Idrante / naspo" },
  { re: /EMERG|SICUREZZA|EXIT|USCITA/, simbolo: "Lampada di emergenza" },
  { re: /RJ.?45|DATI|LAN|TD\b|TRASM/, simbolo: "Presa dati" },
  { re: /\bTV\b|SAT|TELEV|ANTENNA/, simbolo: "Presa TV" },
  { re: /TEL(EF)?\b|TELEFON/, simbolo: "Presa telefono" },
  { re: /PRESA|SCHUKO|UNEL|P\d{2}\b|BIPASSO|PRESE/, simbolo: "Punto presa" },
  { re: /INTERR|DEVIAT|INVERT|PULSANT|COMANDO|DIMMER/, simbolo: "Punto comando" },
  { re: /TERMOST|CRONOT/, simbolo: "Termostato" },
  { re: /QUADRO|\bQE\b|\bQ\d|CENTRAL/, simbolo: "Quadro / centralino" },
  { re: /SPLIT|FANCOIL|FAN.?COIL|\bUI\b|CDZ|CLIMA|CASSETTA.?4/, simbolo: "Unità interna climatizzazione" },
  { re: /\bUE\b|MOTOCOND|ESTERNA/, simbolo: "Unità esterna climatizzazione" },
  { re: /BOCCHETT|DIFFUS|GRIGLIA|ANEMOST/, simbolo: "Bocchetta / diffusore aria" },
  { re: /RADIAT|TERMOSIF|SCALDAS/, simbolo: "Radiatore" },
  { re: /PLAF|APPLIQUE|FARETT|LAMP|LUCE|LUCI|DOWNLIGHT|PANNELLO.?LED|\bLED\b|NEON|CORPO.?ILL|ILLUM/, simbolo: "Punto luce" },
  { re: /TELECAM|CAMERA|TVCC|CCTV/, simbolo: "Telecamera" },
  { re: /CITOF|VIDEOCIT|PULSANTIERA/, simbolo: "Citofono / videocitofono" },
  { re: /SCATOLA|CASSETTA|DERIVAZ/, simbolo: "Scatola di derivazione" },
];

/** Blocchi che non sono impianti: cartigli, frecce del nord, quote, viste. */
const NON_IMPIANTI = /^(A\$C|\*|_)|CARTIG|TITLE|NORD|NORTH|FRECCIA|ARROW|QUOTA|DIM|SEZIONE|SECTION|LOGO|TABELLA|VIEW|VISTA|ALZATO/;

export interface Suggerimento { simbolo: string; ignora: boolean }

/** Simbolo proposto dal nome del blocco, o null se il nome non dice niente. */
export function suggerisciSimbolo(nomeBlocco: string): Suggerimento | null {
  const n = normalizzaNomeBlocco(nomeBlocco).replace(/[_\-.]+/g, " ");
  if (NON_IMPIANTI.test(normalizzaNomeBlocco(nomeBlocco)) || NON_IMPIANTI.test(n)) return { simbolo: nomeBlocco.trim(), ignora: true };
  for (const r of REGOLE) {
    if (!r.re.test(n)) continue;
    const ampere = /(\d{1,2})\s?A\b/.exec(n);
    return { simbolo: ampere ? `${r.simbolo} ${ampere[1]}A` : r.simbolo, ignora: false };
  }
  return null;
}

export interface SceltaSimbolo {
  chiave: string;
  simbolo: string;
  descrizione: string | null;
  scomposizione_id: string | null;
  ignora: boolean;
  /** Da dove viene la scelta: salvata per l'azienda, suggerita dal nome, o niente. */
  origine: "mappa" | "suggerito" | "vuoto";
}

/** Per ogni simbolo trovato: la scelta già salvata, o il suggerimento dal nome. */
export function scelteIniziali(simboli: SimboloCad[], mappa: VoceMappa[]): Record<string, SceltaSimbolo> {
  const salvate = new Map(mappa.map((v) => [normalizzaNomeBlocco(v.nome_blocco), v]));
  const out: Record<string, SceltaSimbolo> = {};
  for (const s of simboli) {
    const v = salvate.get(s.chiave);
    if (v) {
      out[s.chiave] = { chiave: s.chiave, simbolo: v.simbolo, descrizione: v.descrizione, scomposizione_id: v.scomposizione_id, ignora: v.ignora, origine: "mappa" };
      continue;
    }
    const sug = s.tipo === "blocco" ? suggerisciSimbolo(s.nome) : null;
    out[s.chiave] = sug
      ? { chiave: s.chiave, simbolo: sug.simbolo, descrizione: null, scomposizione_id: null, ignora: sug.ignora, origine: "suggerito" }
      : { chiave: s.chiave, simbolo: "", descrizione: null, scomposizione_id: null, ignora: s.tipo === "cerchio", origine: "vuoto" };
  }
  return out;
}

/** Le scelte da salvare nella mappa dell'azienda (solo quelle con un simbolo o «ignora»). */
export function vociDaSalvare(scelte: SceltaSimbolo[]): VoceMappa[] {
  return scelte
    .filter((s) => s.ignora || s.simbolo.trim())
    .map((s) => ({
      nome_blocco: normalizzaNomeBlocco(s.chiave),
      simbolo: (s.simbolo.trim() || s.chiave).slice(0, 200),
      descrizione: s.descrizione?.trim() || null,
      scomposizione_id: s.scomposizione_id,
      ignora: s.ignora,
    }));
}

export interface RigaConteggioCad {
  simbolo: string;
  descrizione_legenda: string | null;
  locale: string | null;
  quantita: number;
  unita: "pz" | "m";
  scomposizione_id: string | null;
  dettaglio: Record<string, unknown>;
}

/**
 * Le righe per planimetrie_conteggi: una per simbolo e locale (pezzi) e una
 * per layer e locale (metri). Simboli uguali da blocchi diversi si sommano.
 */
export function righeConteggio(
  simboli: SimboloCad[],
  scelte: Record<string, SceltaSimbolo>,
  lunghezze: LunghezzaMisurata[],
  nomiLunghezze: Record<string, string>,
  info: Record<string, unknown>,
): RigaConteggioCad[] {
  const m = new Map<string, RigaConteggioCad>();
  for (const s of simboli) {
    const c = scelte[s.chiave];
    if (!c || c.ignora || !c.simbolo.trim()) continue;
    for (const [locale, n] of Object.entries(s.perLocale)) {
      const loc = locale === SENZA_LOCALE ? null : locale;
      const k = `${c.simbolo.trim()}|${loc ?? ""}|pz`;
      const r = m.get(k);
      if (r) {
        r.quantita += n;
        const blocchi = r.dettaglio.blocchi as string[];
        if (!blocchi.includes(s.nome)) blocchi.push(s.nome);
      } else {
        m.set(k, {
          simbolo: c.simbolo.trim(), descrizione_legenda: c.descrizione ?? null, locale: loc, quantita: n, unita: "pz",
          scomposizione_id: c.scomposizione_id, dettaglio: { ...info, blocchi: [s.nome] },
        });
      }
    }
  }
  for (const l of lunghezze) {
    const nome = (nomiLunghezze[l.layer] || l.layer).trim();
    for (const [locale, metri] of Object.entries(l.perLocale)) {
      if (!(metri > 0)) continue;
      const loc = locale === SENZA_LOCALE ? null : locale;
      m.set(`${nome}|${loc ?? ""}|m|${l.layer}`, {
        simbolo: nome, descrizione_legenda: `Percorso disegnato sul layer «${l.layer}»`, locale: loc, quantita: metri, unita: "m",
        scomposizione_id: null, dettaglio: { ...info, layer: l.layer },
      });
    }
  }
  return [...m.values()];
}
