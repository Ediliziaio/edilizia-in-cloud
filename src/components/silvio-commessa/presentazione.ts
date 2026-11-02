/**
 * Come il popup «Crea con Silvio» mostra il piano (31/10/2026, fase 1, lotto 1.5).
 * Vedi docs/piano-silvio-commessa-ai.md, 3.2 e 3.4.
 *
 * Funzioni pure, provate senza React: il testo di un valore, lo stato di un'area, i conti
 * della barra in basso, la stima del costo di una lettura, la domanda di Silvio, il
 * «Controlla» e i rifiuti dell'annullamento in parole.
 */
import { azioneDellaVariabile, livelloDi, ordineDaSolo, type Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import {
  AREE, inVigore, type Area, type Conflitto, type CostoDelPiano, type FaseDelPiano, type PianoCommessa,
  type RataDelPiano, type Stato, type Valore, type CondizioniContratto, type Modifica,
} from "../../../shared/silvio-commessa/piano.ts";
import { REGISTRO, variabile, variabiliDellArea, type Variabile } from "../../../shared/silvio-commessa/registro.ts";
import { completezzaPiano, type Completezza } from "../../../shared/silvio-commessa/completezza.ts";
import type { Riconosciuto } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { personaOccupata, type ContestoRisorse, type PersonaDelPiano } from "../../../shared/silvio-commessa/risorse.ts";
import { annulla, type Passo } from "../../../shared/silvio-commessa/fondi.ts";
import { COLONNE_SCRIVIBILI, entraNellaScrittura, giaNellaCommessa, type ScritturaCommessa } from "@/lib/silvio-commessa/scrittura";
import { avvisoLettureFallite } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import type { EsitoCommessa } from "@/lib/silvio-commessa/bozze";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";

export const NOMI_AREE: Record<Area, string> = {
  identita: "Identità",
  cliente: "Cliente",
  cantiere: "Cantiere",
  economia: "Economia",
  pagamenti: "Pagamenti",
  fasi: "Fasi e tempi",
  persone: "Persone",
  ditte: "Ditte e subappalti",
  costi: "Costi e margine",
  mezzi: "Mezzi",
  materiali: "Materiali e acquisti",
  sicurezza: "Sicurezza e documenti",
  sal_scadenze: "SAL e scadenze",
  comunicazione: "Comunicazione",
};

/**
 * Il segno di uno stato: ✓ fatto · ✋ da guardare · ? manca · ⚠ da sistemare (fonti in disaccordo, conti che non tornano, risorsa non disponibile).
 * «?» e non l'emoji ❓: quella è rossa su ogni telefono, e un dato facoltativo che manca sembrava un allarme come il ⚠.
 */
export const SEGNI: Record<Stato, string> = { fatto: "✓", proposta: "✋", manca: "?", attenzione: "⚠" };
export const NOMI_STATI: Record<Stato, string> = {
  fatto: "pronto", proposta: "da guardare", manca: "manca", attenzione: "da sistemare",
};

/** I nomi delle colonne nei campi delle variabili con più colonne. */
const NOMI_COLONNE: Record<string, string> = {
  client_name: "Nome", client_company: "Azienda", client_phone: "Telefono", client_email: "Email",
  indirizzo_lavori: "Indirizzo dei lavori", work_address: "Indirizzo (altro campo)",
  work_lat: "Latitudine", work_lng: "Longitudine", work_geocoded_at: "Posizione trovata il",
  quote_number: "Preventivo", quote_id: "Id del preventivo", fv_progetto_id: "Progetto fotovoltaico",
  rst_progetto_id: "Progetto ristrutturazione",
  status: "Stato", current_status_id: "Stato",
  deposit_amount: "Importo", deposit_expected_date: "Data prevista",
  deposit_2_amount: "Importo", deposit_2_expected_date: "Data prevista",
  balance_amount: "Importo", balance_expected_date: "Data prevista",
  financing_amount: "Importo", financing_cost: "Costo", financing_expected_date: "Data prevista",
  next_action: "Cosa fare", next_action_date: "Entro il",
  dl_notification_email: "Email", dl_notification_phone: "Telefono",
  distanza_sede_km: "Km", distanza_sede_minuti: "Minuti", distanza_sede_il: "Calcolata il",
  destination_warehouse_id: "Magazzino", warehouse_arrival_date: "Arrivo in magazzino",
};
export const nomeColonna = (c: string) => NOMI_COLONNE[c] ?? c.replace(/_/g, " ");

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** «9 nov 2026» da «2026-11-09», senza passare dal fuso orario. */
export function dataBreve(s: string, conAnno = true): string {
  const m = DATA.exec(s);
  if (!m) return s;
  const giorno = `${Number(m[3])} ${MESI[Number(m[2]) - 1]}`;
  return conAnno ? `${giorno} ${m[1]}` : giorno;
}

/** «lun 9 nov» per i pulsanti delle domande. */
export function dataConGiorno(s: string): string {
  const m = DATA.exec(s);
  if (!m) return s;
  const g = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${GIORNI[g]} ${dataBreve(s, false)}`;
}

// «9.800 €», non «9800 €»: in italiano le migliaia a quattro cifre si raggruppano solo con "always".
export const euro = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 === 0 ? 0 : 2, useGrouping: "always" });

/** Quanto può costare una dettatura della chat (90 secondi al massimo), markup compreso. */
export const STIMA_DETTATURA_EUR = 0.03;

/** Il costo di una lettura: «0,01 €», con i millesimi quando servono. */
export const euroAI = (n: number) =>
  `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 3 : 2 })} €`;

/** «Squadra» → «squadra», ma «POS e DUVRI» e «SAL e scadenze» restano come sono. */
export const minuscola = (t: string) => (/^\p{Lu}(\p{Ll}|')/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

const CHIAVI_DATA = new Set(["fasi.work_start_date", "fasi.work_end_date", "fasi.expected_date"]);
const TIPI_PAGAMENTO: Record<string, string> = { standard: "acconto e saldo", financing: "finanziamento" };

const vuoto = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function scalare(chiave: string, colonna: string | null, v: unknown): string {
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (typeof v === "number") {
    if (chiave === "economia.vat_rate") return `${v.toLocaleString("it-IT")} %`;
    if (/amount|cost|importo/.test(colonna ?? chiave)) return euro(v);
    return v.toLocaleString("it-IT");
  }
  if (typeof v === "string") {
    if (DATA.test(v)) return dataBreve(v);
    if (chiave === "pagamenti.payment_type") return TIPI_PAGAMENTO[v] ?? v;
    return v;
  }
  return "";
}

/** «quantità 1»: quanto si prenota di un mezzo (un ponteggio si prenota a quantità, e Silvio ne propone 1). */
export function quantitaMezzo(x: { quantita?: number | null }): string {
  return `quantità ${Number(x.quantita) > 0 ? Number(x.quantita).toLocaleString("it-IT") : 1}`;
}
const quantitaMezzi = (elenco: readonly { quantita?: number | null }[]) => [...new Set(elenco.map(quantitaMezzo))].join(", ");

function condizioni(c: CondizioniContratto): string {
  const parti: string[] = [];
  if (c.numero_contratto) parti.push(`n. ${c.numero_contratto}`);
  if (c.durata_giorni) parti.push(`${c.durata_giorni} giorni`);
  if (c.penale_giorno_eur) parti.push(`penale ${euro(c.penale_giorno_eur)}/giorno`);
  else if (c.penale_giorno_permille) parti.push(`penale ${c.penale_giorno_permille}‰/giorno`);
  if (c.ritenuta_garanzia_pct) parti.push(`ritenuta ${c.ritenuta_garanzia_pct} %`);
  if (c.anticipo_pct) parti.push(`anticipo ${c.anticipo_pct} %`);
  else if (c.anticipo_eur) parti.push(`anticipo ${euro(c.anticipo_eur)}`);
  if (c.pagamento_giorni) parti.push(`pagamento a ${c.pagamento_giorni} giorni`);
  if (c.subappalto_ammesso != null) parti.push(c.subappalto_ammesso ? "subappalto ammesso" : "subappalto non ammesso");
  if (c.garanzia_anni) parti.push(`garanzia ${c.garanzia_anni} anni`);
  if (c.cig) parti.push(`CIG ${c.cig}`);
  if (c.cup) parti.push(`CUP ${c.cup}`);
  return parti.join(" · ");
}

/** Le date estreme delle fasi: «9 nov → 19 dic». */
export function arcoDelleFasi(fasi: readonly FaseDelPiano[]): { inizio: string | null; fine: string | null } {
  const inizi = fasi.map((f) => f.start_date).filter((d): d is string => !!d && DATA.test(d)).sort();
  const fini = fasi.map((f) => f.end_date).filter((d): d is string => !!d && DATA.test(d)).sort();
  return { inizio: inizi[0] ?? null, fine: fini[fini.length - 1] ?? null };
}

/** Il testo breve di un valore, come compare nella riga dell'area. Senza `vedeCosti`, gli elenchi non dicono quanto costano. */
export function testoValore(chiave: string, valore: unknown, vedeCosti = true): string {
  if (vuoto(valore)) return "—";
  switch (chiave) {
    case "fasi.order_work_phases": {
      const fasi = valore as FaseDelPiano[];
      const { inizio, fine } = arcoDelleFasi(fasi);
      const giorni = fasi.reduce((s, f) => s + (f.giorni ?? 0), 0);
      const tempi = inizio && fine ? ` · ${dataBreve(inizio, false)} → ${dataBreve(fine, false)}`
        : giorni ? ` · circa ${giorni} giorni lavorativi` : "";
      return `${fasi.length} ${fasi.length === 1 ? "fase" : "fasi"}${tempi}`;
    }
    case "pagamenti.rate": {
      const rate = valore as RataDelPiano[];
      const totale = rate.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      // Senza il totale gli importi non ci sono ancora: «0 €» sarebbe falso.
      const quanto = totale > 0 || !rate.some((r) => r.percent != null) ? euro(totale) : "in percentuale";
      return `${rate.length} ${rate.length === 1 ? "rata" : "rate"} · ${quanto}`;
    }
    case "economia.order_items": {
      const n = (valore as unknown[]).length;
      return `${n} ${n === 1 ? "riga" : "righe"}`;
    }
    case "costi.previsti": {
      const costi = valore as CostoDelPiano[];
      const tot = costi.reduce((s, c) => s + (Number(c.importo) || 0), 0);
      const senza = costi.reduce((s, c) => s + (c.vociSenzaCosto || 0), 0);
      return `${euro(tot)}${senza ? ` · ${senza} voci senza costo` : ""}`;
    }
    case "economia.condizioni_contratto":
      return condizioni(valore as CondizioniContratto) || "—";
    case "identita.origine": {
      const o = valore as Record<string, unknown>;
      return typeof o.quote_number === "string" ? `preventivo ${o.quote_number}` : "collegata";
    }
    case "cliente.customer_id":
      return "cliente del gestionale collegato";
    // Fase 4: gli elenchi di persone, ditte, mezzi, ordini e bozze.
    case "persone.squadra":
    case "ditte.assegnate":
    case "mezzi.allocazioni":
    case "materiali.acquisti":
    case "ditte.contratti": {
      if (!Array.isArray(valore)) break;
      const elenco = valore as Array<{ stato?: string; costo_previsto?: number; importo?: number; nome?: string; fornitore?: string }>;
      const buoni = elenco.filter((x) => x?.stato !== "attenzione");
      const ko = elenco.length - buoni.length;
      const cosa = ({
        "persone.squadra": ["persona", "persone"], "ditte.assegnate": ["ditta", "ditte"], "mezzi.allocazioni": ["mezzo", "mezzi"],
        "materiali.acquisti": ["ordine in bozza", "ordini in bozza"], "ditte.contratti": ["contratto in bozza", "contratti in bozza"],
      } as Record<string, [string, string]>)[chiave];
      const soldi = !vedeCosti ? 0 : chiave === "ditte.assegnate" ? buoni.reduce((t, x) => t + (Number(x.costo_previsto) || 0), 0)
        : chiave === "ditte.contratti" ? buoni.reduce((t, x) => t + (Number(x.importo) || 0), 0) : 0;
      const nomi = [...new Set(buoni.map((x) => x.nome ?? x.fornitore).filter(Boolean))].slice(0, 3).join(", ");
      const quante = chiave === "mezzi.allocazioni" && buoni.length ? ` · ${quantitaMezzi(buoni)}` : "";
      return `${buoni.length} ${buoni.length === 1 ? cosa[0] : cosa[1]}${nomi ? `: ${nomi}` : ""}${quante}${soldi > 0 ? ` · ${euro(soldi)}` : ""}`
        + (ko ? ` · ⚠ ${ko} non ${ko === 1 ? "disponibile" : "disponibili"}` : "");
    }
    case "fasi.avvisi_meteo": {
      if (!Array.isArray(valore)) break;
      const n = valore.length;
      return `⚠ ${n} ${n === 1 ? "fase all'aperto" : "fasi all'aperto"} in mesi a rischio`;
    }
    case "sicurezza.adempimenti":
    case "sicurezza.pos_duvri": {
      if (!Array.isArray(valore)) break;
      const p = valore as Array<{ titolo?: string; scadenza?: string | null }>;
      const entro = p.map((x) => x.scadenza).filter((d): d is string => !!d).sort()[0];
      return `${p.length} ${p.length === 1 ? "promemoria" : "promemoria"}${entro ? ` · entro ${dataBreve(entro, false)}` : ""}`;
    }
    case "comunicazione.avvio_cliente": {
      const m = valore as { canale?: string | null; destinatario?: string | null; scadenza?: string | null };
      const dove = m.canale === "email" ? "per email" : m.canale === "whatsapp" ? "per WhatsApp" : "";
      return `bozza da mandare ${dove}${m.scadenza ? ` entro ${dataBreve(m.scadenza, false)}` : ""}`.replace(/\s+/g, " ").trim();
    }
  }
  if (Array.isArray(valore)) return `${valore.length} ${valore.length === 1 ? "elemento" : "elementi"}`;
  // Le tabelle collegate che il lettore della commessa conta soltanto.
  if (typeof valore === "object" && Object.keys(valore as object).join() === "righe") {
    const n = Number((valore as { righe: unknown }).righe) || 0;
    return `${n} già ${n === 1 ? "inserito" : "inseriti"}`;
  }
  if (typeof valore === "object") {
    return Object.entries(valore as Record<string, unknown>)
      .filter(([c, v]) => !vuoto(v) && !/_id$/.test(c))
      .map(([c, v]) => scalare(chiave, c, v))
      .filter(Boolean)
      .join(" · ") || "—";
  }
  return scalare(chiave, null, valore);
}

/** L'importo di una rata: quello vero; la percentuale finché il totale non c'è (revisione 2/11, G20). */
export function importoRata(r: Pick<RataDelPiano, "amount" | "percent" | "daPercentuale">): string {
  const importo = Number(r.amount) || 0;
  if (importo > 0) return r.daPercentuale && r.percent != null ? `${euro(importo)} (${r.percent.toLocaleString("it-IT")} %)` : euro(importo);
  return r.percent != null ? `${r.percent.toLocaleString("it-IT")} %` : euro(0);
}

// ── Gli importi di vendita (permesso «Importi di vendita», revisione 2/11, P2) ──

/**
 * Le variabili che dicono quanto vale il lavoro. Chi non ha il permesso non le vede e non le
 * cambia, qui come nel resto del gestionale; la RPC comunque non scrive gli importi di chi non li vede.
 */
const CHIAVI_IMPORTI: ReadonlySet<string> = new Set([
  "economia.total_amount", "economia.vat_rate", "economia.order_bonus_lines", "economia.condizioni_contratto",
  "pagamenti.rate", "pagamenti.acconto", "pagamenti.secondo_acconto", "pagamenti.saldo", "pagamenti.finanziamento", "costi.margine",
]);
/** Le variabili che sono soltanto costi: chi non ha il permesso sui costi non le vede (`can_view_costs`). */
const CHIAVI_COSTI: ReadonlySet<string> = new Set(["costi.previsti", "costi.margine", "ditte.ritenute"]);
/** Gli elenchi che si vedono senza le cifre: i nomi delle ditte restano, quanto costano no. */
const ELENCHI_CON_COSTI: Readonly<Record<string, RegExp>> = {
  "fasi.order_work_phases": /^costo/, "fasi.date_fasi": /^costo/,
  "ditte.assegnate": /^costo/, "ditte.contratti": /importo|prezzo|totale/, "materiali.acquisti": /importo|prezzo|totale/,
  // Le colonne vere di order_items sono `purchase_price` e `standard_cost` (quarta revisione, 5).
  "economia.order_items": /cost|purchase|acquist|margin|markup|ricaric|sconto_forn|supplier_(price|disc)/,
};
/** Gli elenchi coi prezzi di vendita dentro. */
const ELENCHI_CON_IMPORTI: Readonly<Record<string, RegExp>> = {
  "fasi.order_work_phases": /^(importo|prezzo)$/, "fasi.date_fasi": /^(importo|prezzo)$/,
  "economia.order_items": /^(iva|vat.*)$|price|amount|total|importo|prezzo|cost|discount|sconto|margin/,
};

export const importoNascosto = (chiave: string, vedeImporti: boolean, vedeCosti = true) =>
  (!vedeImporti && CHIAVI_IMPORTI.has(chiave)) || (!vedeCosti && CHIAVI_COSTI.has(chiave));
export const TESTO_IMPORTO_NASCOSTO = "non visibile col tuo profilo";

/** La variabile può dire un costo: nota e testo citato (un'offerta, «9.000 €») non si mostrano a chi non li vede. */
export const parlaDiCosti = (chiave: string, vedeCosti: boolean) => !vedeCosti && (CHIAVI_COSTI.has(chiave) || chiave in ELENCHI_CON_COSTI);

/** Per la chat: «tutta» non si vede; «cifre» si vede senza le cifre, e non si riscrive da lì. */
export function riservataPerProfilo(chiave: string, vedeImporti: boolean, vedeCosti: boolean): "tutta" | "cifre" | null {
  if (importoNascosto(chiave, vedeImporti, vedeCosti)) return "tutta";
  return (!vedeCosti && chiave in ELENCHI_CON_COSTI) || (!vedeImporti && chiave in ELENCHI_CON_IMPORTI) ? "cifre" : null;
}

/** Il valore senza i campi che `via` riconosce, a qualunque profondità. */
function senzaCampi(x: unknown, via: RegExp): unknown {
  if (Array.isArray(x)) return x.map((e) => senzaCampi(e, via));
  if (!x || typeof x !== "object") return x;
  return Object.fromEntries(Object.entries(x).filter(([k]) => !via.test(k)).map(([k, e]) => [k, senzaCampi(e, via)]));
}

/** Il piano senza le variabili di `chiavi` e senza le cifre degli elenchi: quello che può leggere la chat. */
function pianoRipulito(piano: PianoCommessa, chiavi: ReadonlySet<string>, elenchi: Readonly<Record<string, RegExp>>): PianoCommessa {
  const pulito = (v: Valore, chiave: string): Valore => (elenchi[chiave] ? { ...v, valore: senzaCampi(v.valore, elenchi[chiave]) } : v);
  const aree: PianoCommessa["aree"] = {};
  for (const area of AREE) {
    const valori = piano.aree[area];
    if (valori) aree[area] = Object.fromEntries(Object.entries(valori).filter(([k]) => !chiavi.has(k)).map(([k, v]) => [k, pulito(v, k)]));
  }
  const conflitti = piano.conflitti.filter((c) => !chiavi.has(c.chiave)).map((c) => ({ ...c, nota: null as string | null, candidati: c.candidati.map((x) => pulito(x, c.chiave)) }));
  return { ...piano, aree, conflitti };
}

/** Il piano senza gli importi di vendita: quello che può leggere la chat per chi non li vede. */
export function senzaImporti(piano: PianoCommessa): PianoCommessa {
  return { ...pianoRipulito(piano, CHIAVI_IMPORTI, ELENCHI_CON_IMPORTI), avvisi: avvisiVisibili(piano.avvisi ?? [], false) };
}

/** Il piano senza i costi: quello che può leggere la chat per chi non li vede. */
export function senzaCosti(piano: PianoCommessa): PianoCommessa {
  return { ...pianoRipulito(piano, CHIAVI_COSTI, ELENCHI_CON_COSTI), avvisi: avvisiVisibili(piano.avvisi ?? [], true, false) };
}

/** Quello che la chat AI riceve per questo profilo: il modello non può dire quello che non ha letto. */
export function vistaPerLaChat(piano: PianoCommessa, vedeImporti: boolean, vedeCosti: boolean): PianoCommessa {
  const senza = vedeImporti ? piano : senzaImporti(piano);
  return vedeCosti ? senza : senzaCosti(senza);
}

/** I nomi delle variabili nascoste, come li citano gli avvisi: «Importo», «IVA»… */
const NOMI_IMPORTI = () => REGISTRO.filter((v) => CHIAVI_IMPORTI.has(v.chiave)).map((v) => `«${v.etichetta}»`);
const NOMI_COSTI = () => REGISTRO.filter((v) => CHIAVI_COSTI.has(v.chiave) || (v.chiave in ELENCHI_CON_COSTI && v.area !== "fasi" && v.area !== "economia")).map((v) => `«${v.etichetta}»`);

/**
 * Gli avvisi del piano da far leggere (G8): una volta sola, senza quelli che parlano ai
 * programmatori (una chiave fuori registro, un'area che non esiste) e, per chi non vede gli
 * importi, senza quelli che li citano.
 */
function avvisiVisibili(avvisi: readonly string[], vedeImporti: boolean, vedeCosti = true): string[] {
  const tecnico = /ignorat[ao]$|risposta senza "valore"|non è una variabile dell'area/;
  return [...new Set(avvisi)].filter((a) => !tecnico.test(a)
    && (vedeImporti || (!a.includes("€") && !NOMI_IMPORTI().some((n) => a.includes(n))))
    && (vedeCosti || (!a.includes("€") && !NOMI_COSTI().some((n) => a.includes(n)))));
}

/** Il tipo di campo per modificare una colonna a mano. */
export type TipoCampo = "testo" | "testo_lungo" | "numero" | "data" | "si_no" | "scelta";
/** Le colonne a scelta chiusa, coi valori che il database accetta. */
export const SCELTE: Record<string, { valore: string; nome: string }[]> = {
  payment_type: [{ valore: "standard", nome: "Acconto e saldo" }, { valore: "financing", nome: "Finanziamento" }],
};
export function tipoCampo(chiave: string, colonna: string): TipoCampo {
  if (SCELTE[colonna]) return "scelta";
  if (/_date$|_il$|_at$/.test(colonna) || CHIAVI_DATA.has(chiave)) return "data";
  if (["total_amount", "vat_rate", "work_lat", "work_lng"].includes(colonna) || /amount|cost|_km|minuti/.test(colonna)) return "numero";
  if (["has_building_bonus", "weekly_report_enabled", "giornale_auto_enabled"].includes(colonna)) return "si_no";
  if (["work_description", "internal_notes"].includes(colonna)) return "testo_lungo";
  return "testo";
}

/** Come si modifica una variabile a mano nel popup. */
export type Modificabile = "campi" | "fasi" | "rate" | "cliente" | "responsabile" | "sede" | "elenco" | "no";
export function comeSiModifica(v: Variabile): Modificabile {
  if (v.chiave === "cliente.customer_id") return "cliente";
  if (v.chiave === "persone.assigned_to") return "responsabile";
  if (v.chiave === "identita.sede_id") return "sede";
  if (v.chiave === "fasi.order_work_phases") return "fasi";
  if (v.chiave === "pagamenti.rate") return "rate";
  if (v.colonne.length && v.colonne.every((c) => !/_id$/.test(c))) return "campi";
  if (v.tabelle?.length) return "elenco";
  return "no";
}

// ── Aree e barra ────────────────────────────────────────────────────────────

export interface RigaArea {
  variabile: Variabile;
  valore: Valore | null;
  conflitto: Conflitto | null;
  stato: Stato;
}

/** Gli elenchi che Silvio scrive già (fase 1); le altre tabelle arrivano con le fasi dopo. */
const ELENCHI_SCRITTI = new Set([
  "cliente.customer_id", "economia.order_items", "pagamenti.rate", "fasi.order_work_phases", "fasi.date_fasi",
  // Fase 4.
  "persone.squadra", "ditte.assegnate", "ditte.contratti", "mezzi.allocazioni", "materiali.acquisti",
  "sicurezza.pos_duvri", "comunicazione.avvio_cliente",
  // Fase 5.
  "sicurezza.adempimenti",
]);

/**
 * Una variabile che manca si mostra (❓) solo se si può riempire adesso: una colonna che
 * Silvio scrive, o un elenco che sa scrivere. Il numero della commessa lo dà il gestionale.
 */
export function siRiempieOra(v: Variabile): boolean {
  if (v.chiave === "identita.order_code") return false;
  return ELENCHI_SCRITTI.has(v.chiave) || v.colonne.some((c) => (COLONNE_SCRIVIBILI as readonly string[]).includes(c));
}

/** Le righe di un'area: le variabili con un valore, più quelle col peso che mancano e si possono riempire. */
export function righeDellArea(piano: PianoCommessa, area: Area, c: Completezza): RigaArea[] {
  return variabiliDellArea(area)
    .map((v): RigaArea | null => {
      const valore = piano.aree[area]?.[v.chiave] ?? null;
      const conflitto = piano.conflitti.find((x) => x.area === area && x.chiave === v.chiave) ?? null;
      const pieno = valore && valore.stato !== "manca" && !vuoto(valore.valore);
      if (!pieno && !conflitto) {
        return siRiempieOra(v) && c.mancano.some((m) => m.chiave === v.chiave) ? { variabile: v, valore, conflitto, stato: "manca" } : null;
      }
      const stato: Stato = conflitto ? "attenzione" : valore!.fonte.tipo === "persona" ? "fatto" : valore!.stato;
      return { variabile: v, valore, conflitto, stato };
    })
    .filter((r): r is RigaArea => r !== null);
}

/** Lo stato dell'area: il peggiore delle sue righe; null se non c'è niente da dire. */
export function statoArea(righe: RigaArea[]): Stato | null {
  if (!righe.length) return null;
  for (const s of ["attenzione", "manca", "proposta"] as const) if (righe.some((r) => r.stato === s)) return s;
  return "fatto";
}

/**
 * Una proposta che entra solo se la persona la conferma (🟡 e 🔴). Dalla fase 5 lo decide
 * l'autonomia dell'azienda per le variabili delle sue azioni: «da sola» non chiede (gli ordini
 * chiedono ancora se uno solo è senza prezzi o sopra la soglia).
 */
export function daConfermare(r: RigaArea, autonomia: Autonomia | null = null): boolean {
  // Un importo scritto dalla chat, un elenco toccato: entra solo con un sì, qualunque sia il livello (G18).
  if (r.valore?.daConfermare) return true;
  if (r.stato !== "proposta" || !r.valore) return false;
  const azione = azioneDellaVariabile(r.variabile.chiave);
  if (!azione) return r.variabile.livello === "propone" || r.variabile.livello === "mai_da_solo";
  const livello = livelloDi(autonomia, azione.azione);
  if (livello !== "da_sola") return livello === "chiede";
  if (azione.azione !== "ordini") return false;
  const oda = Array.isArray(r.valore.valore) ? (r.valore.valore as { righe?: Parameters<typeof ordineDaSolo>[1] }[]) : [];
  return oda.some((o) => !ordineDaSolo(autonomia, o?.righe ?? []));
}

/**
 * Il testo della conferma. Con gli ordini «da sola» la scrittura fa entrare quelli coi prezzi e
 * sotto la soglia e tiene fuori gli altri: il popup dice proprio questo (revisione 1/11, L12).
 */
export function testoConferma(r: RigaArea, autonomia: Autonomia | null = null, opz: { fineDalleFasi?: string | null; vedeCosti?: boolean } = {}): string {
  // Senza il sì la fine non resta vuota: `commessa_pianifica_fasi` la prende dall'ultima fase.
  if (r.variabile.chiave === "fasi.work_end_date" && opz.fineDalleFasi) {
    return `Proposta di Silvio. Se non la confermi, la fine lavori segue le fasi: ${dataBreve(opz.fineDalleFasi)}.`;
  }
  const generico = (parlaDiCosti(r.variabile.chiave, opz.vedeCosti ?? true) ? null : r.valore?.nota) ?? "Proposta di Silvio: entra nella commessa se la confermi.";
  const azione = azioneDellaVariabile(r.variabile.chiave);
  if (azione?.azione !== "ordini" || livelloDi(autonomia, "ordini") !== "da_sola" || !Array.isArray(r.valore?.valore)) return generico;
  const oda = r.valore.valore as { righe?: Parameters<typeof ordineDaSolo>[1] }[];
  const soli = oda.filter((o) => ordineDaSolo(autonomia, o?.righe ?? [])).length;
  const fuori = oda.length - soli;
  const parola = (n: number) => (n === 1 ? "1 ordine" : `${n} ordini`);
  if (!soli) return `${parola(fuori)} senza prezzi o sopra la soglia: ${fuori === 1 ? "entra" : "entrano"} solo se confermi.`;
  return `${parola(soli)} coi prezzi e sotto la soglia ${soli === 1 ? "entra" : "entrano"} da ${soli === 1 ? "solo" : "soli"}. `
    + `${parola(fuori)} senza prezzi o sopra la soglia ${fuori === 1 ? "entra" : "entrano"} solo se confermi: «Va bene» conferma tutto.`;
}

/** La proposta entra senza chiedere: l'azione è «da sola» nelle impostazioni. */
export function fattoDaSolo(r: RigaArea, autonomia: Autonomia | null = null): boolean {
  const azione = azioneDellaVariabile(r.variabile.chiave);
  return r.stato === "proposta" && !!r.valore && !!azione && livelloDi(autonomia, azione.azione) === "da_sola" && !daConfermare(r, autonomia);
}

export interface ContiBarra {
  pronte: number;
  aspettano: number;
  costoEur: number;
}

/** «38 voci pronte · 3 aspettano te · costo AI 0,04 €». */
export function contiDellaBarra(piano: PianoCommessa, scrittura: ScritturaCommessa, costoEur: number): ContiBarra {
  // Una voce che entra in parte è pronta; il resto aspetta nel «Controlla».
  const fuori = new Set(scrittura.escluse.filter((e) => !e.parziale).map((e) => e.chiave));
  let pronte = 0;
  for (const area of AREE) {
    for (const [chiave, v] of Object.entries(piano.aree[area] ?? {})) {
      // In «completa» conta solo quello che si aggiunge.
      if (giaNellaCommessa(piano, v)) continue;
      if (v.stato !== "manca" && !vuoto(v.valore) && !fuori.has(chiave)) pronte += 1;
    }
  }
  const c = completezzaPiano(piano);
  const chiede = c.mancano.filter((v) => v.livello === "chiede" && !(v.chiave === "cliente.customer_id" && scrittura.cliente.nome)).length;
  const daVedere = scrittura.escluse.filter((e) => e.motivo === "proposta da confermare").length;
  return { pronte, aspettano: piano.conflitti.length + daVedere + chiede, costoEur };
}

/** Il margine previsto, se il piano ha importo e costi: importo − costi, e la percentuale. */
export function marginePrevisto(piano: PianoCommessa): { euro: number; percento: number } | null {
  // Quelli in vigore: una proposta della chat ancora da confermare non cambia i conti.
  const importo = Number(inVigore(piano.aree.economia?.["economia.total_amount"])?.valore);
  if (!(importo > 0)) return null;
  const { totale } = costiConosciuti(piano);
  if (!(totale > 0)) return null;
  const margine = importo - totale;
  return { euro: margine, percento: Math.round((100 * margine) / importo) };
}

const stessoNome = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** I costi che Silvio conosce (dai costi previsti, altrimenti dalle voci delle fasi), e dove non ne conosce. */
function costiConosciuti(piano: PianoCommessa): { totale: number; fasiSenza: number; fasiTutte: number; vociSenza: number } {
  const costi = inVigore(piano.aree.costi?.["costi.previsti"])?.valore;
  const dalleFonti = Array.isArray(costi) ? (costi as CostoDelPiano[]) : [];
  const elenco = inVigore(piano.aree.fasi?.["fasi.order_work_phases"])?.valore;
  const fasi = Array.isArray(elenco) ? (elenco as FaseDelPiano[]) : [];
  const totale = dalleFonti.reduce((s, c) => s + (Number(c.importo) || 0), 0);
  if (totale > 0) {
    const fasiSenza = fasi.filter((f) => !dalleFonti.some((c) => Number(c.importo) > 0 && stessoNome(c.fase, f.name))).length;
    return { totale, fasiSenza, fasiTutte: fasi.length, vociSenza: dalleFonti.reduce((s, c) => s + (c.vociSenzaCosto || 0), 0) };
  }
  const conCosto = (x: { costo?: number | null }) => Number(x.costo) > 0;
  const voci = fasi.flatMap((f) => f.sottofasi ?? []);
  return {
    totale: voci.reduce((s, x) => s + (Number(x.costo) || 0), 0),
    fasiSenza: fasi.filter((f) => !(f.sottofasi ?? []).some(conCosto)).length,
    fasiTutte: fasi.length,
    vociSenza: fasi.filter((f) => (f.sottofasi ?? []).some(conCosto)).flatMap((f) => f.sottofasi ?? []).filter((x) => !conCosto(x)).length,
  };
}

/** Oltre questo margine un'impresa edile non arriva: i costi inseriti non sono tutti, anche se ogni voce ne ha uno. */
const MARGINE_NON_CREDIBILE = 80;

export type MargineDaMostrare =
  | { parziale: false; euro: number; percento: number }
  | { parziale: true; costi: number; mancano: string };

/**
 * Il margine come si può dire. Con i costi di una fase sola verrebbe 98 %, e un titolare legge
 * 98 %: finché i costi sono parziali si dice quanti ne sono entrati e cosa manca, senza percentuale.
 */
export function margineDaMostrare(piano: PianoCommessa): MargineDaMostrare | null {
  const m = marginePrevisto(piano);
  if (!m) return null;
  const c = costiConosciuti(piano);
  const mancano = c.fasiSenza > 0 ? `${c.fasiSenza === 1 ? "manca" : "mancano"} ${c.fasiSenza} ${c.fasiSenza === 1 ? "fase" : "fasi"} su ${c.fasiTutte}`
    : c.vociSenza > 0 ? `${c.vociSenza === 1 ? "manca 1 voce" : `mancano ${c.vociSenza} voci`}`
      : m.percento >= MARGINE_NON_CREDIBILE ? "pochi per l'importo: mancano ditte e materiali?" : null;
  return mancano ? { parziale: true, costi: c.totale, mancano } : { parziale: false, ...m };
}

/**
 * Le date che `commessa_pianifica_fasi` scrive sulla commessa, se le colonne sono vuote: la prima
 * e l'ultima delle fasi datate che entrano. Una fine «da confermare» non ferma questa scrittura.
 */
export function dateDalleFasi(s: Pick<ScritturaCommessa, "fasi" | "date_fasi">): { inizio: string | null; fine: string | null } {
  const datate = [...s.fasi.filter((f) => f.inizio && f.fine), ...s.date_fasi];
  return { inizio: datate.map((f) => f.inizio!).sort()[0] ?? null, fine: datate.map((f) => f.fine!).sort().at(-1) ?? null };
}

/** La fine dei lavori: la data in vigore, o l'ultima fine delle fasi. Con la scrittura, quella che la commessa avrà davvero. */
export function fineLavori(piano: PianoCommessa, s?: ScritturaCommessa): string | null {
  const scritta = inVigore(piano.aree.fasi?.["fasi.work_end_date"]);
  if (s && !giaNellaCommessa(piano, scritta)) {
    const scrive = s.ordine.work_end_date;
    if (typeof scrive === "string") return scrive;
    const dalleFasi = dateDalleFasi(s).fine;
    if (dalleFasi) return dalleFasi;
  }
  if (typeof scritta?.valore === "string" && DATA.test(scritta.valore)) return scritta.valore;
  const fasi = inVigore(piano.aree.fasi?.["fasi.order_work_phases"])?.valore;
  return Array.isArray(fasi) ? arcoDelleFasi(fasi as FaseDelPiano[]).fine : null;
}

// ── Costo delle letture ─────────────────────────────────────────────────────

/**
 * La stima di una lettura, prima di farla (dalle misure del lotto 1.2, configurazione
 * predefinita del router): circa 0,01 € per un PDF fino a 10 pagine, 0,005 € per una foto o
 * un testo. Le letture a regole costano zero. Una scansione costa di più (OCR): lo dice la nota.
 */
export function stimaLettura(r: Pick<Riconosciuto, "ai" | "immagine" | "fonte" | "lettore">, dimensione = 0): number {
  if (!r.ai || r.lettore === "non_letto") return 0;
  if (r.immagine || r.fonte === "testo") return 0.005;
  // Un PDF grande ha più pagine: un centesimo ogni 1,5 MB circa, fino a 4.
  return Math.min(0.04, 0.01 * Math.max(1, Math.ceil(dimensione / 1_500_000)));
}

// ── Le domande di Silvio ────────────────────────────────────────────────────

export type Risposta =
  | { etichetta: string; modifica: Modifica | Modifica[] }
  | { etichetta: string; apri: string };

export interface Domanda {
  testo: string;
  risposte: Risposta[];
}

/** Il primo lunedì lavorativo dopo oggi, AAAA-MM-GG. */
export function prossimoLunedi(oggi: Date): string {
  const d = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()));
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}

/** Il predefinito di `orders.vat_rate`: l'IVA di una commessa che nasce senza che nessuno l'abbia detta. */
export const IVA_PREDEFINITA = 22;

/** «Crea» senza un'IVA detta: la colonna scriverebbe il predefinito. */
export function ivaPredefinita(piano: PianoCommessa, scrittura: Pick<ScritturaCommessa, "modo" | "ordine" | "preventivo_id">): boolean {
  if (scrittura.modo !== "crea" || scrittura.preventivo_id || scrittura.ordine.vat_rate !== undefined) return false;
  const x = piano.aree.economia?.["economia.vat_rate"];
  return !x || x.stato === "manca" || vuoto(x.valore);
}

function etichettaFonte(v: Valore): string {
  return v.fonte.etichetta.replace(/^(preventivo|computo)\s+/i, (m) => m.toLowerCase());
}

/**
 * La domanda del momento, una sola (3.4, punto 4): prima i conflitti, poi i ❓ veri
 * (cliente, inizio, importo, cantiere), poi le proposte da guardare.
 */
export function domandaDiSilvio(piano: PianoCommessa, scrittura: ScritturaCommessa, oggi = new Date(), vedeImporti = true, vedeCosti = true): Domanda | null {
  const conflitto = piano.conflitti[0];
  if (conflitto) {
    const v = variabile(conflitto.chiave);
    const [a, b] = conflitto.candidati;
    const nascosto = importoNascosto(conflitto.chiave, vedeImporti, vedeCosti);
    const nota = conflitto.nota && !parlaDiCosti(conflitto.chiave, vedeCosti) ? `${conflitto.nota} ` : "";
    return {
      testo: nascosto
        ? `«${v?.etichetta ?? "Un valore"}»: ${etichettaFonte(a)} e ${etichettaFonte(b)} non sono d'accordo. Quale tengo?`
        : `«${v?.etichetta ?? "Un valore"}»: ${etichettaFonte(a)} dice ${testoValore(conflitto.chiave, a.valore, vedeCosti)}, `
          + `${etichettaFonte(b)} dice ${testoValore(conflitto.chiave, b.valore, vedeCosti)}. ${nota}Quale tengo?`,
      risposte: conflitto.candidati.map((c) => ({
        etichetta: nascosto ? etichettaFonte(c) : `${testoValore(conflitto.chiave, c.valore, vedeCosti)} (${etichettaFonte(c)})`,
        modifica: { tipo: "scegli_fonte", area: conflitto.area, chiave: conflitto.chiave, fonte: c.fonte.tipo, idFonte: c.fonte.id ?? null, etichettaFonte: c.fonte.etichetta },
      })),
    };
  }
  const valore = (chiave: string) => {
    const v = variabile(chiave);
    const x = v ? piano.aree[v.area]?.[chiave] : undefined;
    return x && x.stato !== "manca" && !vuoto(x.valore) ? x.valore : undefined;
  };
  if (scrittura.modo === "crea" && !valore("cliente.customer_id") && !scrittura.cliente.nome && !scrittura.cliente.email && !scrittura.preventivo_id) {
    return { testo: "Per chi è il lavoro? Scegli il cliente o crealo.", risposte: [{ etichetta: "Scegli il cliente", apri: "cliente.customer_id" }] };
  }
  if (!valore("fasi.work_start_date")) {
    const lunedi = prossimoLunedi(oggi);
    return {
      testo: "Quando iniziano i lavori? Con la data metto le date a tutte le fasi.",
      risposte: [
        { etichetta: `Inizio ${dataConGiorno(lunedi)}`, modifica: { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: lunedi } },
        { etichetta: "Scegli la data", apri: "fasi.work_start_date" },
      ],
    };
  }
  if (vedeImporti && !valore("economia.total_amount")) {
    return { testo: "Qual è l'importo dei lavori, senza IVA?", risposte: [{ etichetta: "Scrivi l'importo", apri: "economia.total_amount" }] };
  }
  if (!valore("cantiere.indirizzo")) {
    const indirizzo = valore("cliente.client_address");
    return {
      testo: "Dov'è il cantiere?",
      risposte: [
        ...(typeof indirizzo === "string"
          ? [{ etichetta: `Dal cliente: ${indirizzo}`, modifica: { tipo: "cambia_valore", area: "cantiere", chiave: "cantiere.indirizzo", valore: { indirizzo_lavori: indirizzo } } as Modifica }]
          : []),
        { etichetta: "Scrivi l'indirizzo", apri: "cantiere.indirizzo" },
      ],
    };
  }
  // Nessuno l'ha detta: la commessa nascerebbe col predefinito della colonna, senza che la persona lo sappia.
  if (vedeImporti && ivaPredefinita(piano, scrittura)) {
    return {
      testo: `Che IVA applico? Nessun documento la dice: se non scegli, la commessa nasce al ${IVA_PREDEFINITA} %.`,
      risposte: [22, 10, 4].map((aliquota) => ({
        etichetta: `${aliquota} %`, modifica: { tipo: "cambia_valore", area: "economia", chiave: "economia.vat_rate", valore: aliquota } as Modifica,
      })),
    };
  }
  const daVedere = scrittura.escluse.filter((e) => e.motivo === "proposta da confermare" && !importoNascosto(e.chiave, vedeImporti, vedeCosti));
  if (daVedere.length) {
    const tutte = accettaProposte(piano, daVedere.map((e) => e.chiave));
    return {
      testo: daVedere.length === 1
        ? `«${daVedere[0].etichetta}» è una mia proposta: entra solo se mi dici di sì.`
        : `${daVedere.length} mie proposte aspettano un tuo sì (${daVedere.map((e) => minuscola(e.etichetta)).join(", ")}).`,
      risposte: [
        ...(tutte.length ? [{ etichetta: daVedere.length === 1 ? "Va bene" : `Va bene a tutte e ${daVedere.length}`, modifica: tutte }] : []),
        { etichetta: daVedere.length === 1 ? "Guardala prima" : "Guardale una per una", apri: daVedere[0].chiave },
      ],
    };
  }
  return null;
}

/** «Dal preventivo PR-0142 ho preso cliente, importo e 6 fasi.» */
export function riassuntoFrammento(etichetta: string, chiavi: string[]): string {
  // «dal preventivo PR-0142», «dal computo …», ma «da Contratto.pdf».
  const da = /^(preventivo|computo|contratto|testo|commessa|vocale)\s/.test(etichetta) ? `Dal ${minuscola(etichetta)}` : `Da ${etichetta}`;
  if (!chiavi.length) return `${da} non ho trovato niente di nuovo per la commessa.`;
  const nomi = chiavi.map((k) => minuscola(variabile(k)?.etichetta ?? k));
  const elenco = nomi.length <= 4 ? nomi : [...nomi.slice(0, 4), `altre ${nomi.length - 4} cose`];
  const testo = elenco.length === 1 ? elenco[0] : `${elenco.slice(0, -1).join(", ")} e ${elenco[elenco.length - 1]}`;
  return `${da} ho preso ${testo}.`;
}

// ── Controlla ───────────────────────────────────────────────────────────────

export interface VoceControlla {
  chiave: string;
  etichetta: string;
  testo: string;
  /** Null: entra tutta. Altrimenti il motivo per cui resta fuori: tutta, o solo una parte con `parziale`. */
  fuori: string | null;
  /** Un elemento entra e un altro no (una persona su due, un ordine su due): `fuori` riguarda solo il resto. */
  parziale?: boolean;
  /** Quello che la persona deve sapere della voce: la proposta sopra il valore che vale, la data presa dalle fasi. */
  nota?: string | null;
}

const PROPOSTA = "proposta da confermare";
/** Le colonne che `commessa_pianifica_fasi` riempie dalle fasi se restano vuote. */
const DATE_DA_FASI: Readonly<Record<string, { colonna: "work_start_date" | "work_end_date"; quale: "inizio" | "fine" }>> = {
  "fasi.work_start_date": { colonna: "work_start_date", quale: "inizio" },
  "fasi.work_end_date": { colonna: "work_end_date", quale: "fine" },
};

/** Cosa nascerà, raggruppato per area nell'ordine del registro; poi cosa resta fuori. */
export function elencoControlla(piano: PianoCommessa, scrittura: ScritturaCommessa, vedeImporti = true, vedeCosti = true): { area: Area; voci: VoceControlla[] }[] {
  // Una variabile può avere più esclusioni, una per elemento: una Map chiave→motivo terrebbe l'ultima.
  const escluse = new Map<string, ScritturaCommessa["escluse"]>();
  for (const e of scrittura.escluse) escluse.set(e.chiave, [...(escluse.get(e.chiave) ?? []), e]);
  const dalleFasi = dateDalleFasi(scrittura);
  return AREE.map((area) => ({
    area,
    voci: REGISTRO.filter((v) => v.area === area)
      .map((v): VoceControlla | null => {
        const x = piano.aree[area]?.[v.chiave];
        const sue = escluse.get(v.chiave) ?? [];
        if (giaNellaCommessa(piano, x)) return null;
        const nascosto = importoNascosto(v.chiave, vedeImporti, vedeCosti);
        const base = { chiave: v.chiave, etichetta: v.etichetta };

        // Inizio e fine vuoti li scrive `commessa_pianifica_fasi` dalle fasi: «resta fuori» sarebbe falso.
        const daFasi = DATE_DA_FASI[v.chiave];
        const dataDalleFasi = daFasi ? dalleFasi[daFasi.quale] : null;
        if (daFasi && dataDalleFasi && scrittura.ordine[daFasi.colonna] === undefined && !giaNellaCommessa(piano, inVigore(x))
          && sue.every((e) => e.motivo === PROPOSTA)) {
          const proposta = typeof x?.valore === "string" && x.valore !== dataDalleFasi ? `: ${testoValore(v.chiave, x.valore)} entra solo se la confermi` : "";
          return { ...base, testo: dataBreve(dataDalleFasi), fuori: null, nota: `segue le fasi${proposta}` };
        }

        if (v.chiave === "economia.vat_rate" && !sue.length && !nascosto && ivaPredefinita(piano, scrittura)) {
          return { ...base, testo: `${IVA_PREDEFINITA} %`, fuori: null, nota: "nessun documento la dice: è quella predefinita, cambiala se è un'altra" };
        }
        if (!sue.length && (!x || x.stato === "manca" || vuoto(x.valore))) {
          // I costi delle voci entrano con le fasi anche senza la variabile: si dicono lo stesso.
          if (v.chiave !== "costi.previsti" || !entraNellaScrittura(v.chiave, scrittura)) return null;
          const nelleVoci = scrittura.fasi.filter((f) => f.origine).flatMap((f) => f.sottofasi).reduce((t, s) => t + (Number(s.costo) || 0), 0);
          return { ...base, testo: nascosto ? TESTO_IMPORTO_NASCOSTO : euro(nelleVoci), fuori: null, nota: "nelle voci delle fasi" };
        }

        // Una proposta della chat sopra un valore: entra quello di prima, la proposta aspetta il sì.
        const sotto = x?.daConfermare ? x.alPostoDi ?? null : null;
        const restano = sotto ? sue.filter((e) => e.motivo !== PROPOSTA) : sue;
        const mostrato = sotto ?? x;
        const testo = !mostrato ? "—" : nascosto ? TESTO_IMPORTO_NASCOSTO : testoValore(v.chiave, mostrato.valore, vedeCosti);
        const proposta = sotto && x && !nascosto
          ? `proposta ${testoValore(v.chiave, x.valore, vedeCosti)} al posto di ${testoValore(v.chiave, sotto.valore, vedeCosti)}: entra solo se la confermi` : null;
        // Un conto che non torna su un valore scelto da una persona: entra, perché l'ha scelto lei, ma si dice.
        const nonTorna = mostrato?.quadratura && mostrato.nota && !restano.length
          ? (nascosto || (parlaDiCosti(v.chiave, vedeCosti) && /\d\s*€/.test(mostrato.nota)) ? "⚠ il conto non torna: da controllare con chi vede gli importi" : `⚠ ${mostrato.nota}`) : null;
        const nota = [proposta, nonTorna].filter(Boolean).join(" ") || null;
        // Il motivo può citare le cifre («le rate fanno 48.500 €»): chi non le vede legge solo che resta fuori.
        const motivi = restano.map((e) => (nascosto && !vedeImporti && CHIAVI_IMPORTI.has(v.chiave) ? "da sistemare, con chi vede gli importi"
          : nascosto || (parlaDiCosti(v.chiave, vedeCosti) && /\d\s*€/.test(e.motivo)) ? "da sistemare, con chi vede i costi" : e.motivo));
        return {
          ...base, testo, fuori: [...new Set(motivi)].join("; ") || null,
          ...(restano.length && restano.every((e) => e.parziale) ? { parziale: true } : {}),
          ...(nota ? { nota } : {}),
        };
      })
      .filter((x): x is VoceControlla => x !== null),
  })).filter((g) => g.voci.length > 0);
}

/**
 * Il piano della sola commessa che si completa (i valori `giaNellaCommessa`): il suo
 * punteggio è il «prima» di «Completa al 34 % → 61 %».
 */
export function pianoDellaCommessa(piano: PianoCommessa): PianoCommessa {
  const aree: PianoCommessa["aree"] = {};
  for (const area of AREE) {
    const solo = Object.entries(piano.aree[area] ?? {}).filter(([, v]) => giaNellaCommessa(piano, v));
    if (solo.length) aree[area] = Object.fromEntries(solo);
  }
  return { ...piano, aree, conflitti: [] };
}

/**
 * Il piano com'era uscito dalle fonti, senza le modifiche della persona: si tolgono i
 * passi della storia uno a uno. È il «proposto» di `silvio_correzioni`.
 */
export function pianoProposto(piano: PianoCommessa, storia: Passo[]): PianoCommessa {
  let out = { piano, storia };
  while (out.storia.length) out = annulla(out.piano, out.storia);
  return out.piano;
}

// ── I rifiuti dell'annullamento, in parole ──────────────────────────────────

const PAROLE_TABELLE: Record<string, string> = {
  orders: "la commessa",
  order_items: "una riga della commessa",
  order_installments: "una rata",
  order_work_phases: "una fase",
  order_work_subphases: "una sottofase",
  order_work_phase_voci: "una voce prevista",
  order_attachments: "un allegato",
  order_documents: "un documento",
  order_employees: "una persona della squadra",
  order_phase_assignments: "un'assegnazione",
  order_notes: "una nota",
  order_status_history: "un cambio di stato",
  company_costs: "un costo",
  order_costs: "un costo",
  costi_commessa: "un costo",
  campo_rapportini: "un rapportino",
  rapportini: "un rapportino",
  timesheet_entries: "delle ore lavorate",
  invoices: "una fattura",
  invoice_lines: "una riga di fattura",
  invoice_payments: "un incasso",
  scadenze: "una scadenza",
  contratti_documents: "il contratto",
  tasks: "un'attività",
  appointments: "un appuntamento",
  purchase_orders: "un ordine d'acquisto",
  supplier_rfqs: "una richiesta d'offerta",
  ddt: "una bolla",
  documenti_trasporto: "una bolla",
  sal: "un SAL",
  sal_records: "un SAL",
  internal_chat_channels: "il canale di cantiere",
  internal_chat_messages: "un messaggio nel canale di cantiere",
  google_calendar_order_events: "un evento in calendario",
  mezzi_allocazioni: "un mezzo",
  material_predictions: "un fabbisogno di materiali",
};

/** «company_costs» → «un costo»; una tabella sconosciuta diventa «un dato collegato». */
export function parolaDellaTabella(tabella: string): string {
  return PAROLE_TABELLE[tabella] ?? "un dato collegato";
}

/**
 * Il rifiuto di `commessa_annulla_silvio` detto alla persona: i nomi delle tabelle e delle
 * colonne diventano parole («un costo», «Importo»).
 */
export function rifiutoInParole(messaggio: string): string {
  let m = /già modificato (\w+) creati da Silvio/.exec(messaggio);
  if (m) return `Non si può annullare: qualcuno ha già modificato ${parolaDellaTabella(m[1])} che Silvio aveva preparato.`;
  m = /lavorato sopra \((\w+)\)/.exec(messaggio);
  if (m) return `Non si può annullare: dopo Silvio qualcuno ha aggiunto ${parolaDellaTabella(m[1])} su questa commessa. Toglilo prima, oppure tieni la commessa com'è.`;
  m = /«(\w+)» è stato cambiato dopo Silvio/.exec(messaggio);
  if (m) {
    const v = REGISTRO.find((x) => x.colonne.includes(m![1]));
    return `Non si può annullare: «${v?.etichetta ?? parolaDellaColonna(m[1])}» è stato cambiato dopo Silvio.`;
  }
  // Quello che dice `_silvio_cosa_e_cambiato`: «si è aggiunto lavoro, righe in «company costs» (company costs)».
  return messaggio
    .replace(/righe in «([a-z_ ]+)»/g, (_, t: string) => parolaDellaTabella(t.replace(/ /g, "_")))
    .replace(/Una riga di «([a-z_ ]+)» creata da Silvio è stata cambiata/g, (_, t: string) => {
      const parola = parolaDellaTabella(t.replace(/ /g, "_"));
      return `${parola.charAt(0).toUpperCase()}${parola.slice(1)} preparato da Silvio è stato cambiato`;
    })
    .replace(/,\s*([^,()]+?) \(([a-z]+(?: [a-z]+)*)\)(\.|$)/g, (tutto, cosa: string, tecnico: string, fine: string) =>
      (tecnico.includes(" ") || PAROLE_TABELLE[tecnico] ? `, ${cosa}${fine}` : tutto))
    .replace(/\(«(\w+)»\)/g, (_, c: string) => `(${parolaDellaColonna(c)})`);
}

/** Le colonne che un rifiuto può citare, in parole. Mai il nome tecnico: lo legge chi lavora in cantiere. */
const PAROLE_COLONNE: Readonly<Record<string, string>> = {
  is_paid: "il pagamento", total_cost: "il costo", cost_preventivo: "il costo previsto", costo_origine: "il costo previsto",
  vat_rate: "l'IVA", notes: "le note", phase_id: "la fase", hours_worked: "le ore", start_date: "la data d'inizio", end_date: "la data di fine",
  status: "lo stato", stato: "lo stato", percentuale: "l'avanzamento", percentuale_avanzamento: "l'avanzamento", importo_venduto: "il venduto",
  name: "il nome", title: "il titolo", due_date: "la scadenza", quantita: "la quantità", dal: "il periodo", al: "il periodo", importo: "l'importo",
};

function parolaDellaColonna(colonna: string): string {
  return PAROLE_COLONNE[colonna] ?? REGISTRO.find((x) => x.colonne.includes(colonna))?.etichetta.toLowerCase() ?? "un dato";
}

// ── Da decidere, suggerimenti della chat, «Crea» (01/11/2026, revisione dell'esperienza) ──

/** «Va bene» a più proposte insieme: confermano il valore che c'è, come il «Va bene» della riga. */
export function accettaProposte(piano: PianoCommessa, chiavi: string[]): Modifica[] {
  return chiavi.flatMap((chiave): Modifica[] => {
    const v = variabile(chiave);
    const x = v ? piano.aree[v.area]?.[chiave] : undefined;
    return v && x && !vuoto(x.valore) ? [{ tipo: "cambia_valore", area: v.area, chiave, valore: x.valore }] : [];
  });
}

/** Una persona, ditta o mezzo proposto ma non disponibile: il ⚠ dentro un elenco. */
export interface NonDisponibile { chiave: string; area: Area; indice: number; nome: string; avviso: string }

export function nonDisponibili(piano: PianoCommessa): NonDisponibile[] {
  const out: NonDisponibile[] = [];
  for (const chiave of ["persone.squadra", "ditte.assegnate", "mezzi.allocazioni", "materiali.acquisti", "ditte.contratti"]) {
    const v = variabile(chiave);
    const x = v ? piano.aree[v.area]?.[chiave]?.valore : undefined;
    if (!v || !Array.isArray(x)) continue;
    (x as { stato?: string; nome?: string; fornitore?: string; avviso?: string | null }[]).forEach((e, indice) => {
      if (e?.stato === "attenzione") out.push({ chiave, area: v.area, indice, nome: e.nome ?? e.fornitore ?? v.etichetta, avviso: e.avviso ?? "non è disponibile" });
    });
  }
  return out;
}

/** Le cose che aspettano la persona, nell'ordine in cui vanno decise: fonti in disaccordo, ⚠, domande, proposte. */
export interface DaDecidere {
  conflitti: Conflitto[];
  nonDisponibili: NonDisponibile[];
  /** I ❓ che chiedono una risposta (cliente, inizio, importo, cantiere). */
  domande: Variabile[];
  /** Le proposte che entrano solo con un sì. */
  proposte: { chiave: string; etichetta: string }[];
  totale: number;
  /** Quello che la persona deve sapere ma non deve decidere: non conta nel totale (D10, G8). */
  avvisi: string[];
}

export function cosaDecidere(
  piano: PianoCommessa, scrittura: ScritturaCommessa, c: Completezza = completezzaPiano(piano),
  opz: { vedeImporti?: boolean; vedeCosti?: boolean; contesto?: ContestoRisorse | null } = {},
): DaDecidere {
  const vedeImporti = opz.vedeImporti ?? true;
  const vedeCosti = opz.vedeCosti ?? true;
  const domande = c.mancano.filter((v) => v.livello === "chiede" && siRiempieOra(v) && !importoNascosto(v.chiave, vedeImporti, vedeCosti)
    && !(v.chiave === "cliente.customer_id" && (scrittura.cliente.nome || scrittura.cliente.email || scrittura.preventivo_id)));
  const proposte = scrittura.escluse.filter((e) => e.motivo === "proposta da confermare" && !importoNascosto(e.chiave, vedeImporti, vedeCosti))
    .map(({ chiave, etichetta }) => ({ chiave, etichetta }));
  const nd = nonDisponibili(piano);
  const letture = opz.contesto ? avvisoLettureFallite(opz.contesto) : null;
  const avvisi = [...(letture ? [letture] : []), ...avvisiVisibili(piano.avvisi ?? [], vedeImporti, vedeCosti)];
  return { conflitti: piano.conflitti, nonDisponibili: nd, domande, proposte, totale: piano.conflitti.length + nd.length + domande.length + proposte.length, avvisi };
}

/** «1 conflitto, 1 persona non disponibile e 6 proposte»: per la barra e la scheda del telefono. */
export function testoDaDecidere(d: DaDecidere): string {
  const parti = [
    d.conflitti.length ? `${d.conflitti.length} ${d.conflitti.length === 1 ? "valore da scegliere" : "valori da scegliere"}` : "",
    d.nonDisponibili.length ? `${d.nonDisponibili.length} non ${d.nonDisponibili.length === 1 ? "disponibile" : "disponibili"}` : "",
    d.domande.length ? `${d.domande.length} ${d.domande.length === 1 ? "dato che manca" : "dati che mancano"}` : "",
    d.proposte.length ? `${d.proposte.length} ${d.proposte.length === 1 ? "proposta" : "proposte"}` : "",
  ].filter(Boolean);
  return parti.length <= 1 ? parti.join("") : `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1]}`;
}

const conta = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

/** Cosa scrive «Crea»: «4 fasi, 2 rate, 1 persona e 1 ditta». Solo quello che entra davvero. */
export function cosaScriveCrea(s: ScritturaCommessa): string {
  const parti = [
    s.fasi.length ? conta(s.fasi.length, "fase", "fasi") : "",
    s.date_fasi.length ? conta(s.date_fasi.length, "data di fase", "date di fase") : "",
    s.righe.length ? conta(s.righe.length, "riga", "righe") : "",
    s.rate.length ? conta(s.rate.length, "rata", "rate") : "",
    s.squadra.length ? conta(s.squadra.length, "persona", "persone") : "",
    s.ditte.length ? conta(s.ditte.length, "ditta", "ditte") : "",
    s.mezzi.length ? conta(s.mezzi.length, "mezzo", "mezzi") : "",
    s.oda.length ? conta(s.oda.length, "ordine in bozza", "ordini in bozza") : "",
    s.contratti.length ? conta(s.contratti.length, "contratto in bozza", "contratti in bozza") : "",
    s.promemoria.length + s.adempimenti.length ? conta(s.promemoria.length + s.adempimenti.length, "promemoria", "promemoria") : "",
  ].filter(Boolean);
  return parti.length <= 1 ? parti.join("") : `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1]}`;
}

// ── Com'è andata la scrittura, in parole (revisione 2/11, P2 e P7) ──

const TOLTE_PERMESSI: Readonly<Record<string, string>> = {
  importi: "gli importi (serve il permesso «Importi di vendita»)",
  contratti_ditte: "i contratti delle ditte (servono i permessi su costi e subappaltatori)",
  squadra: "la squadra (la cambia solo un amministratore)",
  condizioni: "le condizioni del contratto (le cambia solo un amministratore)",
  adempimenti: "i promemoria di sicurezza (serve il permesso sulla sicurezza di cantiere)",
  ordini: "gli ordini ai fornitori (serve il permesso sui costi)",
  costi: "i costi previsti di voci e ditte, che nascono a 0 (serve il permesso sui costi)",
};
const TOLTE_AUTONOMIA: Readonly<Record<string, string>> = {
  squadra: "la squadra", mezzi: "i mezzi", ordini: "gli ordini ai fornitori", ditte: "le ditte",
  contratti_ditte: "i contratti delle ditte", promemoria: "i promemoria", avvio_cliente: "il messaggio d'avvio al cliente",
};

/** Quello che doveva entrare ed è rimasto fuori: una riga per motivo, mai una chiave tecnica. */
export function restatoFuori(esito: Pick<EsitoCommessa, "tolte_permessi" | "tolte_autonomia" | "risorse">, piano: PianoCommessa): string[] {
  const out: string[] = [];
  const parole = (codici: string[] | undefined, nomi: Readonly<Record<string, string>>) =>
    [...new Set((codici ?? []).map((c) => nomi[c] ?? "altri dati"))].join(", ");
  const permessi = parole(esito.tolte_permessi, TOLTE_PERMESSI);
  if (permessi) out.push(`Non sono entrati, per i tuoi permessi: ${permessi}.`);
  const autonomia = parole(esito.tolte_autonomia, TOLTE_AUTONOMIA);
  if (autonomia) out.push(`Non sono entrati, perché nelle impostazioni Silvio non lo fa: ${autonomia}.`);
  const contratti = piano.aree.ditte?.["ditte.contratti"]?.valore;
  for (const s of esito.risorse?.saltati ?? []) {
    const nome = Array.isArray(contratti) ? (contratti as { external_team_id?: string; nome?: string }[]).find((c) => c?.external_team_id === s.contratto)?.nome : null;
    out.push(`Contratto non preparato, ${nome ?? "una ditta"}: ${erroreLeggibile(s.motivo, "non si è potuto fare")}.`);
  }
  return out;
}

/** Un suggerimento della chat: o un messaggio da mandare a Silvio, o una risposta che il popup dà da sé. */
export type Suggerimento =
  | { etichetta: string; testo: string }
  | { etichetta: string; locale: "cosa_manca" };

/** I suggerimenti sotto la chat, secondo com'è la bozza adesso: al massimo quattro. */
export function suggerimentiChat(piano: PianoCommessa, c: Completezza = completezzaPiano(piano)): Suggerimento[] {
  const ha = (area: Area, chiave: string) => {
    const x = piano.aree[area]?.[chiave];
    return !!x && x.stato !== "manca" && !vuoto(x.valore);
  };
  const fasi = piano.aree.fasi?.["fasi.order_work_phases"]?.valore;
  const conDate = Array.isArray(fasi) && (fasi as FaseDelPiano[]).some((f) => f.start_date);
  const out: Suggerimento[] = [];
  if (conDate) out.push({ etichetta: "Sposta tutto di una settimana", testo: "Sposta tutto di una settimana" });
  if (ha("persone", "persone.squadra")) out.push({ etichetta: "Chi lavora qui?", testo: "Chi lavora su questa commessa?" });
  if (ha("ditte", "ditte.assegnate")) out.push({ etichetta: "Togli la ditta", testo: "Togli la ditta" });
  if (c.mancano.length || piano.conflitti.length) out.push({ etichetta: "Cosa manca?", locale: "cosa_manca" });
  if (!conDate && Array.isArray(fasi) && fasi.length) out.push({ etichetta: "Si parte lunedì prossimo", testo: "Si parte lunedì prossimo" });
  return out.slice(0, 4);
}

/** Gli esempi del primo ingresso: si toccano e finiscono nel campo, da completare. */
export const ESEMPI_PRIMO_INGRESSO = [
  "Rifare il bagno di 6 mq a Monza, 12.000 €, si parte a metà novembre",
  "Cappotto su una villetta a Lodi, 38.000 €, due mesi di lavoro",
];

/**
 * Chi può prendere il posto di una persona col ⚠: i dipendenti attivi liberi nelle stesse
 * date, che non sono già su quella fase. Al massimo due, nell'ordine dell'elenco.
 */
export function alternativePersona(piano: PianoCommessa, n: NonDisponibile, ctx: ContestoRisorse | null): { id: string; nome: string }[] {
  if (!ctx || n.chiave !== "persone.squadra") return [];
  const squadra = piano.aree.persone?.["persone.squadra"]?.valore as PersonaDelPiano[] | undefined;
  const chi = squadra?.[n.indice];
  if (!chi) return [];
  const giaSullaFase = new Set((squadra ?? []).filter((p) => p.fase === chi.fase).map((p) => p.employee_id));
  return ctx.dipendenti
    .filter((d) => d.attivo && !giaSullaFase.has(d.id) && !personaOccupata(ctx, d.id, chi.dal ?? null, chi.al ?? null))
    .slice(0, 2)
    .map((d) => ({ id: d.id, nome: d.nome }));
}

/** «Metti Luca al posto di Mario»: la squadra con la persona cambiata, libera nelle stesse date. */
export function sostituisciPersona(piano: PianoCommessa, n: NonDisponibile, al: { id: string; nome: string }): Modifica {
  const squadra = [...((piano.aree.persone?.["persone.squadra"]?.valore as PersonaDelPiano[] | undefined) ?? [])];
  const prima = squadra[n.indice];
  squadra[n.indice] = { ...prima, employee_id: al.id, nome: al.nome, stato: "proposta", avviso: null, motivo: `al posto di ${prima.nome}: libero in quelle date` };
  return { tipo: "cambia_valore", area: "persone", chiave: "persone.squadra", valore: squadra };
}
