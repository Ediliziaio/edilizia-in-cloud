/**
 * Gli agenti di recupero del coordinatore: profilo dell'azienda, listini, storico.
 *
 * Sono letture, non chiamate AI. Girano col client dell'utente: le regole del database (azienda, ruolo,
 * utente bloccato) valgono per ognuna, e in più ogni lettura filtra per l'azienda del preventivo. I costi
 * si leggono SOLO se chi lancia la verifica ha il permesso: senza, le colonne di costo non vengono
 * nemmeno chieste e le fonti di soli costi (fornitori, acquisti) non partono.
 *
 * Ogni lettura ha un tetto di righe e un tempo massimo. Se il tetto taglia, l'agente lo dice
 * (`parziale`): un listino letto a metà non può far concludere «questa voce non ha un prezzo».
 */
import type { NaturaPrezzo, TipoFonte } from "./tipi";

/** Ciò che l'azienda ha scritto nelle impostazioni dei preventivi: può non aver scelto niente. */
export interface ImpostazioniMargine { margineObiettivoPct: number | null; margineMinimoPct: number | null }

// Il client arriva da fuori (Supabase vero o finto nei test): solo la forma che serve.
export type DbLettura = { from(tabella: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Una riga di una fonte, prima di sapere a quale voce corrisponde. */
export interface RigaFonte {
  id: string;
  tipo: TipoFonte;
  natura: NaturaPrezzo;
  codice: string;
  descrizione: string;
  unita: string;
  valore: number;
  etichetta: string;
  riferimento: string;
  data: string | null;
  validoAl: string | null;
  scaduto: boolean;
  condizioni: string;
  /** Storico: la quantità del preventivo d'origine, per sapere se è confrontabile. */
  quantita: number | null;
  /** Un prezzo solo proposto o rifiutato si mostra, ma non si sceglie come fonte. */
  selezionabile: boolean;
}

export interface EsitoAgente<T> { dati: T; letture: number; avvisi: string[] }

export const TETTI = { listino: 1500, vociFornitore: 2000, preventivi: 200, righePreventivi: 3000, acquisti: 1000, attesaMs: 8000 } as const;

const numero = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const prezzo = (v: unknown): number | null => { const n = numero(v); return n !== null && n > 0 && n <= 1_000_000 ? n : null; };
const testo = (v: unknown, max = 3000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const giorno = (v: unknown): string | null => { const s = testo(v, 40); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const netto = (lordo: number, scontoPct: unknown) => {
  const s = numero(scontoPct) ?? 0;
  return s > 0 && s < 100 ? Math.round(lordo * (100 - s)) / 100 : lordo;
};
const sconto = (v: unknown) => { const s = numero(v) ?? 0; return s > 0 && s < 100 ? `sconto ${String(s).replace(".", ",")}% già tolto` : ""; };

type Riga = Record<string, unknown>;
async function leggi(query: any, cosa: string): Promise<Riga[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = typeof query.abortSignal === "function" ? query.abortSignal(AbortSignal.timeout(TETTI.attesaMs)) : query;
  const { data, error } = await q;
  if (error) throw new Error(`${cosa}: lettura non riuscita`);
  return Array.isArray(data) ? data as Riga[] : [];
}

export async function agenteProfilo(db: DbLettura, companyId: string): Promise<EsitoAgente<ImpostazioniMargine>> {
  const righe = await leggi(db.from("preventivo_impostazioni")
    .select("margine_target_default, margine_minimo_percentuale").eq("company_id", companyId).limit(1), "Impostazioni dei preventivi");
  const pct = (v: unknown) => { const n = numero(v); return n !== null && n > 0 && n < 95 ? n : null; };
  return { dati: { margineObiettivoPct: pct(righe[0]?.margine_target_default), margineMinimoPct: pct(righe[0]?.margine_minimo_percentuale) }, letture: 1, avvisi: [] };
}

export async function agenteListini(db: DbLettura, companyId: string, opzioni: { costi: boolean; oggi: string }): Promise<EsitoAgente<RigaFonte[]>> {
  const avvisi: string[] = []; const righe: RigaFonte[] = []; let letture = 1;
  const colonne = `id, codice, nome, descrizione, unita, prezzo_vendita, created_at${opzioni.costi ? ", prezzo_costo, costo_interno" : ""}`;
  const tariffe = await leggi(db.from("tariffe_aziendali").select(colonne).eq("company_id", companyId).eq("attivo", true)
    .order("created_at", { ascending: false }).limit(TETTI.listino + 1), "Listino aziendale");
  if (tariffe.length > TETTI.listino) avvisi.push(`Il listino aziendale ha più di ${TETTI.listino} voci: ho letto le più recenti.`);
  for (const t of tariffe.slice(0, TETTI.listino)) {
    const base: Omit<RigaFonte, "id" | "natura" | "valore" | "condizioni"> = {
      codice: testo(t.codice, 160), descrizione: [testo(t.nome), testo(t.descrizione)].filter(Boolean).join(" — "), unita: testo(t.unita, 40),
      etichetta: "Listino aziendale", riferimento: testo(t.codice, 160) || testo(t.nome, 80), data: giorno(t.created_at),
      validoAl: null, scaduto: false, quantita: null, selezionabile: true, tipo: "listino_aziendale",
    };
    if (!base.descrizione) continue;
    const vendita = prezzo(t.prezzo_vendita);
    // La data è quella di inserimento: il listino non registra quando un prezzo è stato ritoccato.
    if (vendita !== null) righe.push({ ...base, id: `listino:${t.id}:v`, natura: "vendita", valore: vendita, condizioni: "data di inserimento nel listino" });
    const costo = opzioni.costi ? prezzo(t.prezzo_costo) ?? prezzo(t.costo_interno) : null;
    if (costo !== null) righe.push({ ...base, id: `listino:${t.id}:c`, natura: "costo", valore: costo, condizioni: "costo scritto nel listino aziendale" });
  }
  if (!opzioni.costi) return { dati: righe, letture, avvisi };

  // Listini dei fornitori: sono COSTI. Anche gli scaduti e gli spenti, ma segnati: servono a spiegare un conflitto.
  letture++;
  const listini = await leggi(db.from("listini_fornitore").select("id, nome, valido_dal, valido_al, attivo, sconto_default_pct")
    .eq("company_id", companyId).limit(200), "Listini dei fornitori");
  if (listini.length) {
    letture++;
    const voci = await leggi(db.from("listino_fornitore_voci").select("id, listino_id, codice, descrizione, unita, prezzo, sconto_pct")
      .eq("company_id", companyId).in("listino_id", listini.map(l => l.id)).limit(TETTI.vociFornitore + 1), "Voci dei listini fornitore");
    if (voci.length > TETTI.vociFornitore) avvisi.push(`I listini dei fornitori hanno più di ${TETTI.vociFornitore} voci: ne ho lette una parte.`);
    const perId = new Map(listini.map(l => [l.id, l]));
    for (const v of voci.slice(0, TETTI.vociFornitore)) {
      const l = perId.get(v.listino_id); const lordo = prezzo(v.prezzo);
      if (!l || lordo === null || !testo(v.descrizione)) continue;
      const scontoPct = numero(v.sconto_pct) ?? numero(l.sconto_default_pct) ?? 0;
      const validoAl = giorno(l.valido_al);
      const scaduto = l.attivo === false || (validoAl !== null && validoAl < opzioni.oggi);
      righe.push({
        id: `fornitore:${v.id}`, tipo: "offerta_fornitore", natura: "costo", codice: testo(v.codice, 160), descrizione: testo(v.descrizione), unita: testo(v.unita, 40),
        valore: netto(lordo, scontoPct), etichetta: `Listino fornitore «${testo(l.nome, 80) || "senza nome"}»`, riferimento: testo(v.codice, 160),
        data: giorno(l.valido_dal), validoAl, scaduto, quantita: null, selezionabile: true,
        condizioni: [sconto(scontoPct), l.attivo === false ? "listino spento" : scaduto ? "listino scaduto" : ""].filter(Boolean).join("; "),
      });
    }
  }

  // Acquisti degli ultimi 12 mesi: il prezzo davvero pagato, se l'ordine ha un prezzo confermato.
  letture++;
  const da = anniPrima(opzioni.oggi, 1);
  const acquisti = await leggi(db.from("purchase_order_items").select("id, sku, description, unit_of_measure, unit_price, discount_percent, quantity, created_at, price_pending")
    .eq("company_id", companyId).gte("created_at", da).order("created_at", { ascending: false }).limit(TETTI.acquisti), "Acquisti recenti");
  for (const a of acquisti) {
    const lordo = prezzo(a.unit_price);
    if (lordo === null || a.price_pending === true || !testo(a.description)) continue;
    righe.push({
      id: `acquisto:${a.id}`, tipo: "acquisto_recente", natura: "costo", codice: testo(a.sku, 160), descrizione: testo(a.description), unita: testo(a.unit_of_measure, 40),
      valore: netto(lordo, a.discount_percent), etichetta: "Ordine di acquisto", riferimento: testo(a.sku, 160), data: giorno(a.created_at), validoAl: null, scaduto: false,
      quantita: numero(a.quantity), selezionabile: true, condizioni: [sconto(a.discount_percent), numero(a.quantity) ? `quantità acquistata ${String(numero(a.quantity)).replace(".", ",")}` : ""].filter(Boolean).join("; "),
    });
  }
  return { dati: righe, letture, avvisi };
}

const ACCETTATO = { testo: "accettato", selezionabile: true }, INVIATO = { testo: "inviato, senza risposta", selezionabile: false };
const SCADUTO = { testo: "scaduto senza risposta", selezionabile: false }, RIFIUTATO = { testo: "rifiutato dal cliente", selezionabile: false };
// Anche le forme al maschile: i preventivi più vecchi le hanno ancora, e senza resterebbero fuori dallo storico.
const ESITO_PREVENTIVO: Record<string, { testo: string; selezionabile: boolean }> = {
  accettata: ACCETTATO, accettato: ACCETTATO, firmato: ACCETTATO, convertita: { testo: "accettato, diventato commessa", selezionabile: true },
  inviata: INVIATO, inviato: INVIATO, visto: INVIATO, scaduta: SCADUTO, scaduto: SCADUTO, rifiutata: RIFIUTATO, rifiutato: RIFIUTATO,
};
/** Righe che non sono una lavorazione: non hanno un prezzo unitario da confrontare. */
const NON_LAVORAZIONI = new Set(["nota", "sconto", "subtotale"]);

/** Lo stesso giorno di `anni` anni prima; il 29 febbraio diventa il 28, mai una data che non esiste. */
export function anniPrima(oggi: string, anni: number): string {
  const [a, m, g] = oggi.slice(0, 10).split("-").map(Number);
  const ultimo = new Date(Date.UTC(a - anni, m, 0)).getUTCDate();
  return `${String(a - anni).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(g, ultimo)).padStart(2, "0")}`;
}

/**
 * I preventivi degli ultimi 24 mesi che sono usciti dall'azienda. Le bozze no: non sono mai state un prezzo.
 * Solo un preventivo accettato dà un prezzo «concordato»; inviati, scaduti e rifiutati si mostrano come
 * contesto (e un rifiuto è un'informazione), ma non diventano la fonte di un prezzo nuovo.
 */
export async function agenteStorico(db: DbLettura, companyId: string, opzioni: { oggi: string; escludiPreventivo?: string }): Promise<EsitoAgente<RigaFonte[]>> {
  const avvisi: string[] = []; let letture = 1;
  const da = anniPrima(opzioni.oggi, 2);
  const preventivi = (await leggi(db.from("quotes").select("id, quote_number, status, signed_at, created_at")
    .eq("company_id", companyId).in("status", Object.keys(ESITO_PREVENTIVO)).gte("created_at", da)
    .order("created_at", { ascending: false }).limit(TETTI.preventivi + 1), "Storico dei preventivi")).filter(q => q.id !== opzioni.escludiPreventivo);
  if (preventivi.length > TETTI.preventivi) avvisi.push(`Lo storico ha più di ${TETTI.preventivi} preventivi negli ultimi due anni: ho letto i più recenti.`);
  const letti = preventivi.slice(0, TETTI.preventivi);
  const perId = new Map(letti.map(q => [q.id, q]));
  const righe: RigaFonte[] = [];
  for (let i = 0; i < letti.length && righe.length < TETTI.righePreventivi; i += 50) {
    letture++;
    const voci = await leggi(db.from("quote_items").select("id, quote_id, name, description, quantity, unit_price, discount_percent, unit_of_measure, codice_prezzario, is_optional, item_category")
      .eq("company_id", companyId).in("quote_id", letti.slice(i, i + 50).map(q => q.id)).limit(1000), "Righe dei preventivi");
    for (const v of voci) {
      const q = perId.get(v.quote_id); const lordo = prezzo(v.unit_price);
      const descrizione = [testo(v.name), testo(v.description)].filter(Boolean).join(" — ");
      if (!q || lordo === null || !descrizione || v.is_optional === true || NON_LAVORAZIONI.has(String(v.item_category))) continue;
      const esito = ESITO_PREVENTIVO[String(q.status)]; const quantita = numero(v.quantity);
      const numeroPreventivo = testo(q.quote_number, 60) || "senza numero";
      righe.push({
        id: `storico:${v.id}`, tipo: "storico", natura: "vendita", codice: testo(v.codice_prezzario, 160), descrizione, unita: testo(v.unit_of_measure, 40),
        valore: netto(lordo, v.discount_percent), etichetta: `Preventivo ${numeroPreventivo} ${esito.testo}`, riferimento: numeroPreventivo,
        data: giorno(q.signed_at) ?? giorno(q.created_at), validoAl: null, scaduto: false, quantita, selezionabile: esito.selezionabile,
        condizioni: [quantita ? `quantità ${String(quantita).replace(".", ",")} ${testo(v.unit_of_measure, 20)}`.trim() : "", sconto(v.discount_percent)].filter(Boolean).join("; "),
      });
    }
  }
  return { dati: righe, letture, avvisi };
}

/**
 * Prezzari pubblicati, solo per le voci che dichiarano già quel prezzario come fonte: lo stesso codice
 * esiste in più regioni con prezzi diversi, e scegliere la regione non è compito di una ricerca.
 */
export async function agentePrezzari(db: DbLettura, codici: string[]): Promise<EsitoAgente<RigaFonte[]>> {
  const cercati = [...new Set(codici.map(c => c.trim()).filter(c => c.length >= 3 && c.length <= 160))].slice(0, 300);
  if (!cercati.length) return { dati: [], letture: 0, avvisi: [] };
  const fonti = await leggi(db.from("prezzario_fonte").select("id, nome, anno").eq("stato", "pubblicato").limit(200), "Prezzari pubblicati");
  if (!fonti.length) return { dati: [], letture: 1, avvisi: [] };
  const perId = new Map(fonti.map(f => [f.id, f]));
  const righe: RigaFonte[] = []; let letture = 1;
  for (let i = 0; i < cercati.length; i += 100) {
    letture++;
    const voci = await leggi(db.from("prezzario_voce").select("id, fonte_id, codice, descrizione, unita_misura, prezzo")
      .in("codice", cercati.slice(i, i + 100)).in("fonte_id", fonti.map(f => f.id)).limit(1000), "Voci di prezzario");
    for (const v of voci) {
      const f = perId.get(v.fonte_id); const valore = prezzo(v.prezzo);
      if (!f || valore === null || !testo(v.descrizione)) continue;
      const anno = numero(f.anno);
      righe.push({
        id: `prezzario:${v.id}`, tipo: "prezzario", natura: "vendita", codice: testo(v.codice, 160), descrizione: testo(v.descrizione), unita: testo(v.unita_misura, 40),
        valore, etichetta: testo(f.nome, 200) || "Prezzario", riferimento: testo(v.codice, 160), data: anno ? `${anno}-01-01` : null, validoAl: null, scaduto: false,
        quantita: null, selezionabile: true, condizioni: anno ? `edizione ${anno}` : "",
      });
    }
  }
  return { dati: righe, letture, avvisi: [] };
}
