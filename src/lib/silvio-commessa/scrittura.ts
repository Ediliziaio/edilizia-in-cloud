/**
 * Dal piano alla scrittura (31/10/2026, fase 1, lotto 1.4): la funzione pura che traduce
 * il `PianoCommessa` della bozza in quello che le RPC del database scrivono
 * (`commessa_crea_con_silvio`, `commessa_completa_con_silvio`, migrazione 20281106100000).
 * Vedi docs/piano-silvio-commessa-ai.md, 3.5 e 5.2.
 *
 * Il client la salva nella bozza (`commessa_bozze.scrittura`) insieme al piano, a ogni
 * salvataggio: le RPC la leggono di lì e la controllano (colonne ammesse, permessi, azienda
 * di ogni id). Serve anche al «Controlla» del popup: è l'elenco di cosa nascerà, e di cosa
 * resta fuori e perché.
 *
 * Cosa entra: i valori «fatto», e le proposte delle variabili che Silvio imposta da solo
 * (🟢) o che chiede solo se mancano (❓). Le proposte 🟡 e 🔴 entrano solo se la persona le
 * ha accettate (allora sono «fatto», fonte persona). I conflitti fermano tutto: li conta
 * `conflitti`, e la RPC rifiuta.
 *
 * In «completa» (fase 2) quello che è già nella commessa (`giaNellaCommessa`) non si
 * riscrive: resta fuori dalla scrittura e dal «Controlla». Le righe e il venditore si
 * aggiungono solo a una commessa nuova: in «completa» finiscono nelle escluse.
 *
 * Le fasi che la commessa ha già senza date (fase 3) ricevono le date in `date_fasi`, solo
 * se la persona ha accettato la proposta: la RPC le passa a `commessa_pianifica_fasi`, che
 * data solo le fasi senza date.
 */
import type {
  CondizioniContratto, CostoDelPiano, FaseDelPiano, PianoCommessa, RataDelPiano, TipoFonte, Valore,
} from "../../../shared/silvio-commessa/piano.ts";
import { REGISTRO, type Variabile } from "../../../shared/silvio-commessa/registro.ts";
import { giaNellaCommessa } from "../../../shared/silvio-commessa/fondi.ts";
import { rigaConQuantitaIntera } from "@/lib/orders/quantitaIntera";

/**
 * Le colonne di `orders` che Silvio può riempire. Le stesse di `_silvio_colonne_scrivibili()`
 * nella migrazione 20281106100000: un test le confronta.
 */
export const COLONNE_SCRIVIBILI = [
  "order_code", "description", "work_description", "tipo_lavoro", "internal_notes", "sede_id",
  "client_name", "client_company", "client_phone", "client_email", "client_address", "opportunity_id",
  "indirizzo_lavori", "work_address", "work_lat", "work_lng", "materials_location",
  "total_amount", "vat_rate", "has_building_bonus", "payment_type",
  "work_start_date", "work_end_date", "expected_date",
  "assigned_to", "capomastro_user_id",
  "next_action", "next_action_date", "weekly_report_enabled", "giornale_auto_enabled",
  "dl_notification_email", "dl_notification_phone",
] as const;
export type ColonnaScrivibile = (typeof COLONNE_SCRIVIBILI)[number];

const DATE = new Set<string>(["work_start_date", "work_end_date", "expected_date", "next_action_date"]);
const NUMERI = new Set<string>(["total_amount", "vat_rate", "work_lat", "work_lng"]);
const SI_NO = new Set<string>(["has_building_bonus", "weekly_report_enabled", "giornale_auto_enabled"]);
const ID = new Set<string>(["sede_id", "opportunity_id", "assigned_to", "capomastro_user_id"]);
const EVENTI_RATA = new Set([
  "data_fissa", "firma_contratto", "accettazione_preventivo", "merce_magazzino", "consegna_cantiere",
  "inizio_lavori", "data_posa", "sal_numero", "fine_lavori", "fattura_acconto", "fattura_saldo", "stato_commessa",
]);

export interface SottofaseScritta {
  nome: string;
  giorni?: number | null;
  quantita?: number | null;
  unita?: string | null;
  importo?: number | null;
  costo?: number | null;
  codice?: string | null;
}

export interface FaseScritta {
  nome: string;
  inizio: string | null;
  fine: string | null;
  /** Da dove vengono voci e costi: `order_work_phase_voci.origine`. Null = niente voci previste. */
  origine: "preventivo" | "computo" | null;
  sottofasi: SottofaseScritta[];
}

export interface DataFaseScritta {
  nome: string;
  inizio: string;
  fine: string;
}

export interface RataScritta {
  position: number;
  label: string;
  type: RataDelPiano["type"];
  amount: number;
  trigger_evento: string;
  trigger_numero: number | null;
}

/** Una riga della commessa nei nomi che legge `create_order_atomic`. */
export type RigaScritta = Record<string, unknown> & { name: string; quantity: number };

export interface Esclusa {
  chiave: string;
  etichetta: string;
  motivo: string;
}

export interface ScritturaCommessa {
  versione: 1;
  modo: "crea" | "completa";
  ordine: Partial<Record<ColonnaScrivibile, string | number | boolean>>;
  /** Per collegare il cliente del gestionale (come Nuova commessa): id, o nome ed email. */
  cliente: { customer_id: string | null; nome: string | null; email: string | null };
  /** Il preventivo d'origine: la commessa nasce con `crea_commessa_preventivo_atomic`. */
  preventivo_id: string | null;
  righe: RigaScritta[];
  rate: RataScritta[];
  fasi: FaseScritta[];
  /** «Completa»: le date per le fasi che la commessa ha già senza date, per nome. */
  date_fasi: DataFaseScritta[];
  venditore: string | null;
  condizioni: CondizioniContratto | null;
  /** Quante decisioni aperte: con più di zero la RPC non scrive. */
  conflitti: number;
  /** Cosa resta fuori, e perché: per il «Controlla». */
  escluse: Esclusa[];
}

const vuoto = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "")
  || (Array.isArray(v) && v.length === 0);

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sta nel motore (fondi.ts), che la usa per le date delle fasi; qui resta per chi la importava da qui.
export { giaNellaCommessa };

/** Il valore entra? Null se sì, altrimenti il motivo. */
function motivoFuori(v: Valore, variabile: Variabile): string | null {
  if (v.stato === "attenzione") return "due fonti dicono cose diverse: scegli quale tenere";
  if (v.stato === "manca" || vuoto(v.valore)) return "manca";
  if (v.stato === "fatto" || v.fonte.tipo === "persona") return null;
  if (variabile.livello === "da_solo" || variabile.livello === "chiede") return null;
  return "proposta da confermare";
}

/** Una colonna col tipo giusto, o undefined se il valore non va bene. */
function colonna(nome: string, valore: unknown): string | number | boolean | undefined {
  if (vuoto(valore)) return undefined;
  if (DATE.has(nome)) return typeof valore === "string" && DATA.test(valore) ? valore : undefined;
  if (NUMERI.has(nome)) {
    const n = typeof valore === "number" ? valore : Number(String(valore).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (SI_NO.has(nome)) return typeof valore === "boolean" ? valore : undefined;
  if (ID.has(nome)) return typeof valore === "string" && UUID.test(valore) ? valore : undefined;
  return typeof valore === "string" ? valore.trim() : typeof valore === "number" ? String(valore) : undefined;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function fasiScritte(fasi: FaseDelPiano[], tipoFonte: TipoFonte, costi: CostoDelPiano[] | null): FaseScritta[] {
  const origine = tipoFonte === "preventivo" || tipoFonte === "computo" ? tipoFonte : null;
  return fasi
    .filter((f) => typeof f?.name === "string" && f.name.trim())
    .map((f) => {
      const sottofasi: SottofaseScritta[] = (f.sottofasi ?? [])
        .filter((s) => typeof s?.name === "string" && s.name.trim())
        .map((s) => ({
          nome: s.name.trim(), quantita: numero(s.quantita), unita: s.unita ?? null,
          importo: numero(s.importo), costo: numero(s.costo), codice: s.codice ?? null,
        }));
      // Un costo della fase senza voci (costi.previsti) diventa una voce sola.
      const costo = costi?.find((c) => c.fase.trim().toLowerCase() === f.name.trim().toLowerCase());
      if (origine && costo && costo.importo > 0 && !sottofasi.some((s) => s.costo != null)) {
        sottofasi.push({ nome: `Costo previsto ${f.name.trim()}`, quantita: 1, costo: costo.importo });
      }
      const inizio = f.start_date && DATA.test(f.start_date) ? f.start_date : null;
      const fine = f.end_date && DATA.test(f.end_date) ? f.end_date : null;
      return {
        nome: f.name.trim(),
        inizio: inizio && fine && fine >= inizio ? inizio : null,
        fine: inizio && fine && fine >= inizio ? fine : null,
        origine,
        sottofasi,
      };
    });
}

function rateScritte(rate: RataDelPiano[]): RataScritta[] {
  return rate
    .filter((r) => r && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0)
    .map((r, i) => ({
      position: i,
      label: (r.label ?? "").trim() || `Rata ${i + 1}`,
      type: r.type === "balance" || r.type === "financing" ? r.type : "deposit",
      amount: Math.round(Number(r.amount) * 100) / 100,
      trigger_evento: r.trigger_evento && EVENTI_RATA.has(r.trigger_evento) ? r.trigger_evento : "data_fissa",
      trigger_numero: r.trigger_numero ?? null,
    }));
}

function righeScritte(righe: unknown[]): RigaScritta[] {
  return righe
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { name?: unknown }).name === "string")
    .map((r, i) => {
      // Gli id delle righe del preventivo non sono righe della commessa.
      const { id: _id, ...resto } = r;
      const riga: RigaScritta = { ...resto, name: String(r.name), quantity: numero(r.quantity) ?? 1, position: i };
      return rigaConQuantitaIntera(riga);
    });
}

/** Traduce il piano. `modo` = completa se il piano ha già la commessa. */
export function scritturaDalPiano(piano: PianoCommessa): ScritturaCommessa {
  const s: ScritturaCommessa = {
    versione: 1,
    modo: piano.orderId ? "completa" : "crea",
    ordine: {},
    cliente: { customer_id: null, nome: null, email: null },
    preventivo_id: null,
    righe: [],
    rate: [],
    fasi: [],
    date_fasi: [],
    venditore: null,
    condizioni: null,
    conflitti: piano.conflitti.length,
    escluse: [],
  };
  const fuori = (v: Variabile, motivo: string) => s.escluse.push({ chiave: v.chiave, etichetta: v.etichetta, motivo });
  const valoreDi = (chiave: string): Valore | undefined => {
    const v = REGISTRO.find((x) => x.chiave === chiave);
    return v ? piano.aree[v.area]?.[chiave] : undefined;
  };
  const costi = (() => {
    const v = valoreDi("costi.previsti");
    return v && Array.isArray(v.valore) ? (v.valore as CostoDelPiano[]) : null;
  })();

  for (const variabile of REGISTRO) {
    const v = piano.aree[variabile.area]?.[variabile.chiave];
    if (!v || giaNellaCommessa(piano, v)) continue;
    const motivo = motivoFuori(v, variabile);
    if (motivo) {
      if (motivo !== "manca") fuori(variabile, motivo);
      continue;
    }

    switch (variabile.chiave) {
      case "cliente.customer_id":
        if (typeof v.valore === "string" && UUID.test(v.valore)) s.cliente.customer_id = v.valore;
        else fuori(variabile, "non è un cliente del gestionale");
        continue;
      case "identita.origine": {
        const quote = (v.valore as { quote_id?: unknown } | null)?.quote_id;
        if (typeof quote === "string" && UUID.test(quote)) s.preventivo_id = quote;
        continue;
      }
      case "economia.order_items":
        if (s.modo === "completa") fuori(variabile, "a una commessa che c'è le righe si aggiungono dalla sua pagina");
        else if (Array.isArray(v.valore)) s.righe = righeScritte(v.valore);
        continue;
      case "pagamenti.rate":
        if (Array.isArray(v.valore)) s.rate = rateScritte(v.valore as RataDelPiano[]);
        continue;
      case "fasi.order_work_phases":
        if (Array.isArray(v.valore)) s.fasi = fasiScritte(v.valore as FaseDelPiano[], v.fonte.tipo, costi);
        continue;
      case "fasi.date_fasi":
        // In «crea» le date stanno dentro le fasi; in «completa» sono per le fasi che ci sono.
        if (s.modo === "completa" && Array.isArray(v.valore)) {
          s.date_fasi = (v.valore as FaseDelPiano[])
            .filter((f) => typeof f?.name === "string" && f.name.trim() && f.start_date && f.end_date
              && DATA.test(f.start_date) && DATA.test(f.end_date) && f.end_date >= f.start_date)
            .map((f) => ({ nome: f.name.trim(), inizio: f.start_date!, fine: f.end_date! }));
        }
        continue;
      case "costi.previsti":
        continue; // dentro le fasi
      case "persone.venditori": {
        if (s.modo === "completa") {
          fuori(variabile, "il venditore di una commessa che c'è si cambia dalla sua pagina");
          continue;
        }
        const primo = Array.isArray(v.valore) ? v.valore[0] : v.valore;
        if (typeof primo === "string" && UUID.test(primo)) s.venditore = primo;
        continue;
      }
      case "economia.condizioni_contratto":
        if (v.valore && typeof v.valore === "object") s.condizioni = v.valore as CondizioniContratto;
        continue;
    }

    if (!variabile.colonne.length) {
      fuori(variabile, "Silvio non la scrive ancora: arriva con le fasi successive");
      continue;
    }
    // Una colonna: il valore. Più colonne: un oggetto con le colonne trovate.
    const coppie: [string, unknown][] = variabile.colonne.length === 1
      ? [[variabile.colonne[0], v.valore]]
      : Object.entries((v.valore ?? {}) as Record<string, unknown>).filter(([c]) => variabile.colonne.includes(c));
    let scritte = 0;
    for (const [nome, valore] of coppie) {
      if (!(COLONNE_SCRIVIBILI as readonly string[]).includes(nome)) continue;
      const c = colonna(nome, valore);
      if (c === undefined) continue;
      s.ordine[nome as ColonnaScrivibile] = c;
      scritte += 1;
    }
    if (!scritte) fuori(variabile, coppie.some(([n]) => (COLONNE_SCRIVIBILI as readonly string[]).includes(n))
      ? "il valore non è nel formato giusto"
      : "Silvio non la scrive: la calcola il gestionale o la decide una persona");
  }

  // Il nome e l'email del cliente servono a ritrovarlo, anche se le colonne restano fuori.
  const nome = valoreDi("cliente.nome")?.valore as Record<string, unknown> | undefined;
  const contatto = valoreDi("cliente.contatto")?.valore as Record<string, unknown> | undefined;
  s.cliente.nome = typeof nome?.client_name === "string" && nome.client_name.trim() ? nome.client_name.trim()
    : typeof nome?.client_company === "string" && nome.client_company.trim() ? nome.client_company.trim() : null;
  s.cliente.email = typeof contatto?.client_email === "string" && contatto.client_email.includes("@")
    ? contatto.client_email.trim() : null;
  return s;
}

/**
 * Cosa manca perché «Crea» parta: i conflitti e, se non c'è nessun modo di ritrovare il
 * cliente, il cliente. Le RPC lo ricontrollano; qui serve al pulsante.
 */
export function prontaPerScrivere(s: ScritturaCommessa): string[] {
  const out: string[] = [];
  if (s.conflitti > 0) out.push(s.conflitti === 1 ? "C'è un valore in conflitto da decidere" : `Ci sono ${s.conflitti} valori in conflitto da decidere`);
  if (s.modo === "crea" && !s.cliente.customer_id && !s.preventivo_id && !s.cliente.nome && !s.cliente.email) {
    out.push("Manca il cliente");
  }
  if (s.modo === "completa" && !daAggiungere(s)) out.push("Silvio non ha ancora niente da aggiungere");
  return out;
}

/** Quante cose «Completa» aggiungerebbe alla commessa: colonne, fasi, rate, condizioni. */
export function daAggiungere(s: ScritturaCommessa): number {
  return Object.keys(s.ordine).length + s.fasi.length + s.date_fasi.length + s.rate.length + s.righe.length
    + (s.condizioni ? 1 : 0) + (s.cliente.customer_id ? 1 : 0);
}
