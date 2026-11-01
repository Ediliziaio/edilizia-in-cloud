/**
 * Come il popup «Crea con Silvio» mostra il piano (31/10/2026, fase 1, lotto 1.5).
 * Vedi docs/piano-silvio-commessa-ai.md, 3.2 e 3.4.
 *
 * Funzioni pure, provate senza React: il testo di un valore, lo stato di un'area, i conti
 * della barra in basso, la stima del costo di una lettura, la domanda di Silvio, il
 * «Controlla» e i rifiuti dell'annullamento in parole.
 */
import {
  AREE, type Area, type Conflitto, type CostoDelPiano, type FaseDelPiano, type PianoCommessa,
  type RataDelPiano, type Stato, type Valore, type CondizioniContratto, type Modifica,
} from "../../../shared/silvio-commessa/piano.ts";
import { REGISTRO, variabile, variabiliDellArea, type Variabile } from "../../../shared/silvio-commessa/registro.ts";
import { completezzaPiano, type Completezza } from "../../../shared/silvio-commessa/completezza.ts";
import type { Riconosciuto } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { annulla, type Passo } from "../../../shared/silvio-commessa/fondi.ts";
import { COLONNE_SCRIVIBILI, giaNellaCommessa, type ScritturaCommessa } from "@/lib/silvio-commessa/scrittura";

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

/** Il segno di uno stato: ✓ fatto · ✋ da guardare · ❓ manca · ⚠ fonti in disaccordo. */
export const SEGNI: Record<Stato, string> = { fatto: "✓", proposta: "✋", manca: "❓", attenzione: "⚠" };
export const NOMI_STATI: Record<Stato, string> = {
  fatto: "pronto", proposta: "da guardare", manca: "manca", attenzione: "fonti in disaccordo",
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

/** Il testo breve di un valore, come compare nella riga dell'area. */
export function testoValore(chiave: string, valore: unknown): string {
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
      return `${rate.length} ${rate.length === 1 ? "rata" : "rate"} · ${euro(totale)}`;
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
      const soldi = chiave === "ditte.assegnate" ? buoni.reduce((t, x) => t + (Number(x.costo_previsto) || 0), 0)
        : chiave === "ditte.contratti" ? buoni.reduce((t, x) => t + (Number(x.importo) || 0), 0) : 0;
      const nomi = [...new Set(buoni.map((x) => x.nome ?? x.fornitore).filter(Boolean))].slice(0, 3).join(", ");
      return `${buoni.length} ${buoni.length === 1 ? cosa[0] : cosa[1]}${nomi ? `: ${nomi}` : ""}${soldi > 0 ? ` · ${euro(soldi)}` : ""}`
        + (ko ? ` · ⚠ ${ko} non ${ko === 1 ? "disponibile" : "disponibili"}` : "");
    }
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

/** Una proposta che entra solo se la persona la conferma (🟡 e 🔴). */
export function daConfermare(r: RigaArea): boolean {
  return r.stato === "proposta" && !!r.valore && (r.variabile.livello === "propone" || r.variabile.livello === "mai_da_solo");
}

export interface ContiBarra {
  pronte: number;
  aspettano: number;
  costoEur: number;
}

/** «38 voci pronte · 3 aspettano te · costo AI 0,04 €». */
export function contiDellaBarra(piano: PianoCommessa, scrittura: ScritturaCommessa, costoEur: number): ContiBarra {
  const fuori = new Set(scrittura.escluse.map((e) => e.chiave));
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
  const importo = Number(piano.aree.economia?.["economia.total_amount"]?.valore);
  if (!(importo > 0)) return null;
  const costi = piano.aree.costi?.["costi.previsti"]?.valore;
  let totale = 0;
  if (Array.isArray(costi)) totale = (costi as CostoDelPiano[]).reduce((s, c) => s + (Number(c.importo) || 0), 0);
  if (!(totale > 0)) {
    const fasi = piano.aree.fasi?.["fasi.order_work_phases"]?.valore;
    if (Array.isArray(fasi)) {
      totale = (fasi as FaseDelPiano[]).flatMap((f) => f.sottofasi ?? []).reduce((s, x) => s + (Number(x.costo) || 0), 0);
    }
  }
  if (!(totale > 0)) return null;
  const margine = importo - totale;
  return { euro: margine, percento: Math.round((100 * margine) / importo) };
}

/** La fine dei lavori: la data scritta, o l'ultima fine delle fasi. */
export function fineLavori(piano: PianoCommessa): string | null {
  const scritta = piano.aree.fasi?.["fasi.work_end_date"]?.valore;
  if (typeof scritta === "string" && DATA.test(scritta)) return scritta;
  const fasi = piano.aree.fasi?.["fasi.order_work_phases"]?.valore;
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
  | { etichetta: string; modifica: Modifica }
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

function etichettaFonte(v: Valore): string {
  return v.fonte.etichetta.replace(/^(preventivo|computo)\s+/i, (m) => m.toLowerCase());
}

/**
 * La domanda del momento, una sola (3.4, punto 4): prima i conflitti, poi i ❓ veri
 * (cliente, inizio, importo, cantiere), poi le proposte da guardare.
 */
export function domandaDiSilvio(piano: PianoCommessa, scrittura: ScritturaCommessa, oggi = new Date()): Domanda | null {
  const conflitto = piano.conflitti[0];
  if (conflitto) {
    const v = variabile(conflitto.chiave);
    const [a, b] = conflitto.candidati;
    return {
      testo: `«${v?.etichetta ?? conflitto.chiave}»: ${etichettaFonte(a)} dice ${testoValore(conflitto.chiave, a.valore)}, `
        + `${etichettaFonte(b)} dice ${testoValore(conflitto.chiave, b.valore)}. Quale tengo?`,
      risposte: conflitto.candidati.map((c) => ({
        etichetta: `${testoValore(conflitto.chiave, c.valore)} (${etichettaFonte(c)})`,
        modifica: { tipo: "scegli_fonte", area: conflitto.area, chiave: conflitto.chiave, fonte: c.fonte.tipo, idFonte: c.fonte.id ?? null },
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
  if (!valore("economia.total_amount")) {
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
  const daVedere = scrittura.escluse.filter((e) => e.motivo === "proposta da confermare");
  if (daVedere.length) {
    return {
      testo: daVedere.length === 1
        ? `«${daVedere[0].etichetta}» è una mia proposta: entra nella commessa solo se la confermi.`
        : `Ho ${daVedere.length} proposte che entrano solo se le confermi: ${daVedere.map((e) => e.etichetta.toLowerCase()).join(", ")}.`,
      risposte: [{ etichetta: daVedere.length === 1 ? "Guardala" : "Guardale", apri: daVedere[0].chiave }],
    };
  }
  return null;
}

/** «Dal preventivo PR-0142 ho preso cliente, importo e 6 fasi.» */
export function riassuntoFrammento(etichetta: string, chiavi: string[]): string {
  if (!chiavi.length) return `Da ${etichetta} non ho trovato niente di nuovo per la commessa.`;
  const nomi = chiavi.map((k) => variabile(k)?.etichetta.toLowerCase() ?? k);
  const elenco = nomi.length <= 4 ? nomi : [...nomi.slice(0, 4), `altre ${nomi.length - 4} cose`];
  const testo = elenco.length === 1 ? elenco[0] : `${elenco.slice(0, -1).join(", ")} e ${elenco[elenco.length - 1]}`;
  return `Da ${etichetta} ho preso ${testo}.`;
}

// ── Controlla ───────────────────────────────────────────────────────────────

export interface VoceControlla {
  chiave: string;
  etichetta: string;
  testo: string;
  /** Null: entra. Altrimenti il motivo per cui resta fuori. */
  fuori: string | null;
}

/** Cosa nascerà, raggruppato per area nell'ordine del registro; poi cosa resta fuori. */
export function elencoControlla(piano: PianoCommessa, scrittura: ScritturaCommessa): { area: Area; voci: VoceControlla[] }[] {
  const escluse = new Map(scrittura.escluse.map((e) => [e.chiave, e.motivo]));
  return AREE.map((area) => ({
    area,
    voci: REGISTRO.filter((v) => v.area === area)
      .map((v): VoceControlla | null => {
        const x = piano.aree[area]?.[v.chiave];
        const motivo = escluse.get(v.chiave) ?? null;
        if (giaNellaCommessa(piano, x)) return null;
        if (!motivo && (!x || x.stato === "manca" || vuoto(x.valore))) return null;
        return { chiave: v.chiave, etichetta: v.etichetta, testo: x ? testoValore(v.chiave, x.valore) : "—", fuori: motivo };
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
    return `Non si può annullare: «${v?.etichetta ?? nomeColonna(m[1])}» è stato cambiato dopo Silvio.`;
  }
  return messaggio;
}
