// ============================================================================
// bloccaPrezzo — il versamento che blocca il listino e poi torna indietro
// ============================================================================
// Il cliente firma un "blocca prezzo" e versa una somma per congelare il
// listino. Quella somma NON è un acconto lavori: prima che partano i bonifici
// parlanti va restituita, altrimenti quell'importo non è detraibile (e se è
// arrivata con bonifico parlante la banca ha già trattenuto l'11%).
//
// Regole che il gestionale deve far rispettare:
//  1. entra con bonifico ORDINARIO (causale "blocca prezzo"), mai parlante;
//  2. non tocca il totale contratto né il residuo cliente — sta fuori dal
//     piano rate;
//  3. in cassa vale come entrata e, alla restituzione, come uscita;
//  4. se resta trattenuto, quell'importo perde la detrazione: va detto.
//
// Modulo puro: nessun import da React/Supabase.
// ============================================================================

export type BloccaPrezzoStato = "incassato" | "restituito" | "trattenuto";
export type BloccaPrezzoMetodo = "bonifico_ordinario" | "contanti" | "assegno" | "pos" | "altro";

export interface BloccaPrezzo {
  id?: string;
  companyId: string;
  customerId?: string | null;
  quoteId?: string | null;
  orderId?: string | null;
  importo: number;
  dataIncasso?: string | null;
  metodo: BloccaPrezzoMetodo;
  stato: BloccaPrezzoStato;
  dataEsito?: string | null;
  /** Quando si prevede di ridare la somma: alimenta il previsionale di cassa. */
  dataPrevistaRestituzione?: string | null;
  riferimento?: string | null;
  note?: string | null;
}

export const STATI_BLOCCA_PREZZO: { value: BloccaPrezzoStato; label: string; hint: string }[] = [
  { value: "incassato", label: "Incassato — da restituire", hint: "Il cliente ha versato, la somma è ancora nostra." },
  { value: "restituito", label: "Restituito", hint: "Somma ribonificata al cliente: la strada per il bonifico parlante è libera." },
  { value: "trattenuto", label: "Trattenuto come acconto", hint: "Resta all'impresa: su quell'importo il cliente NON ha detrazione." },
];

export const METODI_BLOCCA_PREZZO: { value: BloccaPrezzoMetodo; label: string }[] = [
  { value: "bonifico_ordinario", label: "Bonifico ordinario" },
  { value: "contanti", label: "Contanti" },
  { value: "assegno", label: "Assegno" },
  { value: "pos", label: "POS / carta" },
  { value: "altro", label: "Altro" },
];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Quanto l'impresa deve ancora ridare indietro. */
export function daRestituire(rows: BloccaPrezzo[]): number {
  return round2(rows.filter((r) => r.stato === "incassato").reduce((s, r) => s + num(r.importo), 0));
}

export function totaleTrattenuto(rows: BloccaPrezzo[]): number {
  return round2(rows.filter((r) => r.stato === "trattenuto").reduce((s, r) => s + num(r.importo), 0));
}

export function totaleRestituito(rows: BloccaPrezzo[]): number {
  return round2(rows.filter((r) => r.stato === "restituito").reduce((s, r) => s + num(r.importo), 0));
}

export interface MovimentoCassa {
  data: string | null;
  verso: "entrata" | "uscita";
  importo: number;
  descrizione: string;
}

/**
 * Impatto sulla cassa: l'incasso è un'entrata, la restituzione un'uscita.
 * Il trattenuto non genera uscita (resta all'impresa).
 */
export function movimentiCassa(rows: BloccaPrezzo[]): MovimentoCassa[] {
  const out: MovimentoCassa[] = [];
  for (const r of rows) {
    const importo = round2(num(r.importo));
    if (importo <= 0) continue;
    out.push({ data: r.dataIncasso ?? null, verso: "entrata", importo, descrizione: "Blocca prezzo incassato" });
    if (r.stato === "restituito") {
      out.push({ data: r.dataEsito ?? null, verso: "uscita", importo, descrizione: "Blocca prezzo restituito al cliente" });
    }
  }
  return out;
}

export interface MovimentoPrevistoBloccaPrezzo {
  /** null = non si sa quando: il piano lo mette fra i movimenti "senza data". */
  data: Date | null;
  importo: number;
  direzione: "in" | "out";
  /** Riga d'origine: serve a chi elenca i movimenti uno per uno. */
  id?: string;
  orderId?: string | null;
}

/**
 * Cosa deve ancora MUOVERSI in cassa, per il previsionale. Diverso da
 * `movimentiCassa`, che è il consuntivo:
 *
 *  • un blocca prezzo ancora aperto è un'uscita futura — certa nel "se",
 *    incerta nel "quando": senza `dataPrevistaRestituzione` esce con data null
 *    e il piano lo dichiara fra i movimenti senza data, mai lo nasconde;
 *  • l'incasso conta SOLO se è ancora nel futuro. Quello già avvenuto è già
 *    dentro il saldo di partenza (Prima Nota o banca): riaggiungerlo sarebbe
 *    contarlo due volte;
 *  • restituito e trattenuto non muovono più nulla in avanti.
 *
 * `oggi` è iniettato per rendere la funzione testabile a data fissa.
 */
export function movimentiPrevisti(
  rows: BloccaPrezzo[],
  oggi: Date = new Date(),
): MovimentoPrevistoBloccaPrezzo[] {
  const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const out: MovimentoPrevistoBloccaPrezzo[] = [];
  for (const r of rows) {
    if (r.stato !== "incassato") continue;
    const importo = round2(num(r.importo));
    if (importo <= 0) continue;

    const origine = { id: r.id, orderId: r.orderId ?? null };
    const incasso = parseDataLocale(r.dataIncasso);
    if (incasso && incasso.getTime() > inizioOggi.getTime()) {
      out.push({ data: incasso, importo, direzione: "in", ...origine });
    }
    out.push({
      data: parseDataLocale(r.dataPrevistaRestituzione),
      importo,
      direzione: "out",
      ...origine,
    });
  }
  return out;
}

/**
 * "2026-09-15" → Date locale a mezzanotte. `new Date("2026-09-15")` la
 * interpreterebbe come UTC e in Italia tornerebbe indietro di un giorno.
 */
function parseDataLocale(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [a, m, g] = iso.split("-").map(Number);
  if (!a || !m || !g) return null;
  const d = new Date(a, m - 1, g);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Saldo netto in cassa dei blocca prezzo (entrate − restituzioni). */
export function saldoCassa(rows: BloccaPrezzo[]): number {
  return round2(
    movimentiCassa(rows).reduce((s, m) => s + (m.verso === "entrata" ? m.importo : -m.importo), 0),
  );
}

export interface AvvisoBloccaPrezzo {
  livello: "info" | "attenzione" | "grave";
  testo: string;
}

export interface ContestoAvvisi {
  /** La commessa gode di detrazione (→ bonifici parlanti in arrivo). */
  hasBuildingBonus?: boolean;
  /** Il saldo della commessa risulta già pagato. */
  saldoPagato?: boolean;
}

/**
 * Gli avvisi che devono comparire sulla commessa. Il caso peggiore è il saldo
 * già incassato con un blocca prezzo mai restituito: a quel punto il cliente
 * ha bonificato più del dovuto e la detrazione balla.
 */
export function avvisiBloccaPrezzo(
  rows: BloccaPrezzo[],
  ctx: ContestoAvvisi = {},
): AvvisoBloccaPrezzo[] {
  const avvisi: AvvisoBloccaPrezzo[] = [];
  const aperto = daRestituire(rows);
  const fmt = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (aperto > 0) {
    if (ctx.saldoPagato) {
      avvisi.push({
        livello: "grave",
        testo: `Il saldo risulta pagato ma ${fmt(aperto)} di blocca prezzo non sono mai stati restituiti: il cliente ha versato più del dovuto e su quella parte rischia di perdere la detrazione.`,
      });
    } else if (ctx.hasBuildingBonus) {
      avvisi.push({
        livello: "attenzione",
        testo: `${fmt(aperto)} di blocca prezzo da restituire prima che il cliente faccia i bonifici parlanti.`,
      });
    } else {
      avvisi.push({ livello: "info", testo: `${fmt(aperto)} di blocca prezzo ancora da restituire.` });
    }
  }

  const trattenuto = totaleTrattenuto(rows);
  if (trattenuto > 0 && ctx.hasBuildingBonus) {
    avvisi.push({
      livello: "attenzione",
      testo: `${fmt(trattenuto)} trattenuti come acconto: su questa parte il cliente non ha detrazione, escludila dai bonifici parlanti.`,
    });
  }

  // Se è entrato con bonifico parlante la banca ha già trattenuto l'11%:
  // restituirlo tale e quale non ripristina la situazione di partenza.
  for (const r of rows) {
    if (r.metodo !== "bonifico_ordinario" && r.metodo !== "altro" && ctx.hasBuildingBonus) {
      avvisi.push({
        livello: "info",
        testo: `Un blocca prezzo è stato incassato per ${METODI_BLOCCA_PREZZO.find((m) => m.value === r.metodo)?.label ?? r.metodo}: verifica che non sia passato per un bonifico parlante (la banca tratterrebbe l'11%).`,
      });
      break;
    }
  }

  return avvisi;
}

// ── Serializzazione (DB ⇄ UI) ───────────────────────────────────────────────

type RigaDb = {
  id?: string | null;
  company_id?: string | null;
  customer_id?: string | null;
  quote_id?: string | null;
  order_id?: string | null;
  importo?: number | string | null;
  data_incasso?: string | null;
  metodo?: string | null;
  stato?: string | null;
  data_esito?: string | null;
  data_prevista_restituzione?: string | null;
  riferimento?: string | null;
  note?: string | null;
};

const STATI = new Set<string>(["incassato", "restituito", "trattenuto"]);
const METODI = new Set<string>(["bonifico_ordinario", "contanti", "assegno", "pos", "altro"]);

export function parseBloccaPrezzo(raw: unknown): BloccaPrezzo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is RigaDb => !!r && typeof r === "object")
    .map((r) => ({
      id: r.id ?? undefined,
      companyId: r.company_id ?? "",
      customerId: r.customer_id ?? null,
      quoteId: r.quote_id ?? null,
      orderId: r.order_id ?? null,
      importo: round2(num(r.importo)),
      dataIncasso: r.data_incasso ?? null,
      metodo: (METODI.has(r.metodo ?? "") ? r.metodo : "altro") as BloccaPrezzoMetodo,
      stato: (STATI.has(r.stato ?? "") ? r.stato : "incassato") as BloccaPrezzoStato,
      dataEsito: r.data_esito ?? null,
      dataPrevistaRestituzione: r.data_prevista_restituzione ?? null,
      riferimento: r.riferimento ?? null,
      note: r.note ?? null,
    }));
}

/**
 * Payload per l'insert/update. Il vincolo DB pretende una data sull'esito:
 * la mettiamo a oggi se l'utente cambia stato senza sceglierla.
 */
export function serializeBloccaPrezzo(row: BloccaPrezzo, oggi = new Date()): RigaDb {
  const esitoRichiesto = row.stato !== "incassato";
  return {
    company_id: row.companyId,
    customer_id: row.customerId || null,
    quote_id: row.quoteId || null,
    order_id: row.orderId || null,
    importo: round2(num(row.importo)),
    data_incasso: row.dataIncasso || null,
    metodo: row.metodo,
    stato: row.stato,
    // Date locali (en-CA): mai toISOString, sposterebbe il giorno a fine serata.
    data_esito: esitoRichiesto ? row.dataEsito || oggi.toLocaleDateString("en-CA") : null,
    data_prevista_restituzione: row.dataPrevistaRestituzione || null,
    riferimento: row.riferimento || null,
    note: row.note || null,
  };
}
