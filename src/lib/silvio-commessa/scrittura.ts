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
 *
 * Fase 4 (1/11/2026): squadra, ditte, mezzi, ordini in bozza, contratti in bozza, promemoria di
 * sicurezza e messaggio d'avvio (shared/silvio-commessa/risorse.ts). Entrano solo se accettati,
 * e solo gli elementi disponibili: quelli segnati ⚠ restano fuori, col motivo. Il contratto
 * segue la sua ditta: una ditta che non entra non ha contratto. Le scrive
 * `_silvio_aggiungi_risorse` (migrazione 20281106130000), con le fasi per nome.
 *
 * Fase 5 (1/11/2026): l'autonomia dell'azienda (shared/silvio-commessa/autonomia.ts) decide per
 * le variabili delle sue azioni, al posto del livello del registro: «vietata» resta fuori,
 * «chiede» entra solo accettata, «da_sola» entra senza il «Va bene» (gli ordini solo coi prezzi
 * e sotto la soglia). Le RPC ritolgono comunque quello che è vietato. Gli adempimenti prima di
 * partire vanno in `adempimenti_sicurezza`; gli avvisi meteo si mostrano e non si scrivono.
 */
import type {
  CondizioniContratto, CostoDelPiano, FaseDelPiano, PianoCommessa, RataDelPiano, TipoFonte, Valore,
} from "../../../shared/silvio-commessa/piano.ts";
import { REGISTRO, type Variabile } from "../../../shared/silvio-commessa/registro.ts";
import { giaNellaCommessa } from "../../../shared/silvio-commessa/fondi.ts";
import { numeroDellaColonna } from "../../../shared/silvio-commessa/letturaAI.ts";
import type {
  ContrattoDelPiano, DittaDelPiano, MezzoDelPiano, OdaDelPiano, PersonaDelPiano, PromemoriaDelPiano,
} from "../../../shared/silvio-commessa/risorse.ts";
import type { AdempimentoDelPiano } from "../../../shared/silvio-commessa/partenza.ts";
import { azioneDellaVariabile, livelloDi, ordineDaSolo, type Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
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
  /**
   * La durata in giorni lavorativi, per le fasi che non hanno ancora le date (l'inizio lavori
   * manca): `order_work_phases` non ha una colonna per la durata, quindi la RPC la mette su
   * una sottofase col nome della fase, come fa il cronoprogramma. Revisione 1/11: prima si perdeva.
   */
  giorni?: number | null;
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

export interface PersonaScritta { employee_id: string; fase: string | null }
export interface DittaScritta { external_team_id: string; fase: string; costo_previsto: number }
export interface MezzoScritto { mezzo_id: string; fasi: string[]; dal: string; al: string | null; quantita: number }
export interface OdaScritto {
  supplier_id: string; fase: string | null; data_ordine: string | null; data_consegna: string | null;
  righe: { descrizione: string; quantita: number; unita: string | null; prezzo: number | null; iva: number | null }[];
  note: string;
}
export interface ContrattoScritto {
  external_team_id: string; fasi: string[]; dal: string | null; al: string | null; importo: number;
  descrizione: string; elenco: ContrattoDelPiano["elenco"];
}
export interface PromemoriaScritto { tipo: PromemoriaDelPiano["tipo"]; titolo: string; testo: string; scadenza: string | null }
export interface AdempimentoScritto { tipo: AdempimentoDelPiano["tipo"]; titolo: string; note: string; scadenza: string | null }

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
  /** Fase 4: le proposte accettate, già filtrate dei ⚠. */
  squadra: PersonaScritta[];
  ditte: DittaScritta[];
  mezzi: MezzoScritto[];
  oda: OdaScritto[];
  contratti: ContrattoScritto[];
  promemoria: PromemoriaScritto[];
  /** Fase 5: CILA o SCIA, notifica preliminare, cartello, suolo pubblico. */
  adempimenti: AdempimentoScritto[];
  /** Quante decisioni aperte: con più di zero la RPC non scrive. */
  conflitti: number;
  /** Cosa resta fuori, e perché: per il «Controlla». */
  escluse: Esclusa[];
}

const vuoto = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "")
  || (Array.isArray(v) && v.length === 0);

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataItaliana = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sta nel motore (fondi.ts), che la usa per le date delle fasi; qui resta per chi la importava da qui.
export { giaNellaCommessa };

/** Il valore entra? Null se sì, altrimenti il motivo. */
function motivoFuori(v: Valore, variabile: Variabile, autonomia: Autonomia | null): string | null {
  if (v.stato === "attenzione") return v.quadratura && v.nota ? v.nota : "due fonti dicono cose diverse: scegli quale tenere";
  if (v.stato === "manca" || vuoto(v.valore)) return "manca";
  const azione = azioneDellaVariabile(variabile.chiave);
  // Vietata vale anche per quello che la persona ha accettato: Silvio non lo scrive.
  if (azione && livelloDi(autonomia, azione.azione) === "vietata") return "nelle impostazioni Silvio non lo fa: si fa dalla pagina della commessa";
  if (v.stato === "fatto" || v.fonte.tipo === "persona") return null;
  if (azione) return livelloDi(autonomia, azione.azione) === "da_sola" ? null : "proposta da confermare";
  if (variabile.livello === "da_solo" || variabile.livello === "chiede") return null;
  return "proposta da confermare";
}

/** Una proposta che entra perché l'azione è «da sola», non perché la persona l'ha accettata. */
const daSola = (v: Valore) => v.stato !== "fatto" && v.fonte.tipo !== "persona";

/** Una colonna col tipo giusto, o undefined se il valore non va bene. */
function colonna(nome: string, valore: unknown): string | number | boolean | undefined {
  if (vuoto(valore)) return undefined;
  if (DATE.has(nome)) return typeof valore === "string" && DATA.test(valore) ? valore : undefined;
  // Coi limiti della colonna (revisione 1/11, L2): un importo negativo o un'IVA al 23 % non entrano.
  if (NUMERI.has(nome)) return numeroDellaColonna(nome, valore).valore;
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
      const datata = !!(inizio && fine && fine >= inizio);
      const giorni = !datata && Number.isInteger(f.giorni) && f.giorni! >= 1 && f.giorni! <= 3650 ? f.giorni! : null;
      return {
        nome: f.name.trim(),
        inizio: datata ? inizio : null,
        fine: datata ? fine : null,
        origine,
        sottofasi,
        ...(giorni ? { giorni } : {}),
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

/**
 * Gli elementi di un elenco della fase 4 che si possono scrivere: quelli segnati ⚠ (non
 * disponibili) restano fuori, ognuno col suo motivo.
 */
function disponibili<T extends { stato?: string; avviso?: string | null }>(
  valore: unknown, variabile: Variabile, fuori: (v: Variabile, motivo: string) => void, nome: (x: T) => string,
): T[] {
  if (!Array.isArray(valore)) return [];
  return (valore as T[]).filter((x) => {
    if (!x || typeof x !== "object") return false;
    if (x.stato !== "attenzione") return true;
    fuori(variabile, `${nome(x)}: ${x.avviso ?? "non disponibile"}`);
    return false;
  });
}

/** Traduce il piano. `modo` = completa se il piano ha già la commessa. */
export function scritturaDalPiano(piano: PianoCommessa, autonomia: Autonomia | null = null): ScritturaCommessa {
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
    squadra: [],
    ditte: [],
    mezzi: [],
    oda: [],
    contratti: [],
    promemoria: [],
    adempimenti: [],
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

  let contrattiAccettati: ContrattoDelPiano[] = [];
  for (const variabile of REGISTRO) {
    const v = piano.aree[variabile.area]?.[variabile.chiave];
    if (!v || giaNellaCommessa(piano, v)) continue;
    const motivo = motivoFuori(v, variabile, autonomia);
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
      case "persone.squadra":
        s.squadra = disponibili<PersonaDelPiano>(v.valore, variabile, fuori, (p) => p.nome)
          .filter((p) => UUID.test(p.employee_id))
          .map((p) => ({ employee_id: p.employee_id, fase: p.fase?.trim() || null }));
        continue;
      case "ditte.assegnate":
        s.ditte = disponibili<DittaDelPiano>(v.valore, variabile, fuori, (d) => `${d.nome} (${d.fase})`)
          .filter((d) => UUID.test(d.external_team_id) && d.fase?.trim())
          .map((d) => ({ external_team_id: d.external_team_id, fase: d.fase.trim(), costo_previsto: Math.max(0, numero(d.costo_previsto) ?? 0) }));
        continue;
      case "mezzi.allocazioni":
        s.mezzi = disponibili<MezzoDelPiano>(v.valore, variabile, fuori, (m) => m.nome)
          .filter((m) => {
            if (UUID.test(m.mezzo_id) && m.dal && DATA.test(m.dal)) return true;
            fuori(variabile, `${m.nome}: senza le date delle fasi non si prenota`);
            return false;
          })
          .map((m) => ({
            mezzo_id: m.mezzo_id, fasi: (m.fasi ?? []).filter(Boolean), dal: m.dal!,
            al: m.al && DATA.test(m.al) && m.al >= m.dal! ? m.al : null, quantita: numero(m.quantita) && numero(m.quantita)! > 0 ? numero(m.quantita)! : 1,
          }));
        continue;
      case "materiali.acquisti":
        s.oda = disponibili<OdaDelPiano>(v.valore, variabile, fuori, (o) => o.fornitore)
          .filter((o) => UUID.test(o.supplier_id) && Array.isArray(o.righe) && o.righe.length)
          .filter((o) => {
            // «Da sola» vale solo per gli ordini coi prezzi e sotto la soglia: gli altri si confermano.
            if (!daSola(v) || ordineDaSolo(autonomia, o.righe)) return true;
            fuori(variabile, `${o.fornitore}: senza prezzi o sopra la soglia, da confermare`);
            return false;
          })
          .map((o) => ({
            supplier_id: o.supplier_id, fase: o.fase?.trim() || null,
            data_ordine: o.data_ordine && DATA.test(o.data_ordine) ? o.data_ordine : null,
            data_consegna: o.data_consegna && DATA.test(o.data_consegna) ? o.data_consegna : null,
            righe: o.righe.filter((r) => r?.descrizione?.trim()).map((r) => ({
              descrizione: r.descrizione.trim(), quantita: numero(r.quantita) && numero(r.quantita)! > 0 ? numero(r.quantita)! : 1,
              unita: r.unita ?? null, prezzo: numero(r.prezzo), iva: numero(r.iva),
            })),
            note: [o.fase ? `Per la fase «${o.fase}».` : "",
              o.data_ordine ? `Da ordinare entro il ${dataItaliana(o.data_ordine)}${o.data_consegna ? `, per la consegna del ${dataItaliana(o.data_consegna)}` : ""}${o.giorni_consegna != null ? ` (tempi del fornitore: ${o.giorni_consegna} giorni)` : ""}.` : "",
              o.offerta_id ? "Dall'offerta del fornitore." : "Prezzi da chiedere al fornitore.",
              "Preparato da Silvio: va controllato e mandato da qui."].filter(Boolean).join(" "),
          }));
        continue;
      case "ditte.contratti":
        // Il contratto segue la ditta: si legge dopo il ciclo, quando le ditte sono note.
        contrattiAccettati = disponibili<ContrattoDelPiano>(v.valore, variabile, fuori, (c) => c.nome);
        continue;
      case "fasi.avvisi_meteo":
        continue; // si mostra nel popup, non si scrive
      case "sicurezza.adempimenti": {
        const elenco = (Array.isArray(v.valore) ? v.valore : []) as AdempimentoDelPiano[];
        for (const a of elenco) {
          if (!a?.titolo?.trim()) continue;
          s.adempimenti.push({
            tipo: a.tipo, titolo: a.titolo.trim(), note: a.testo ?? "",
            scadenza: a.scadenza && DATA.test(a.scadenza) ? a.scadenza : null,
          });
        }
        continue;
      }
      case "sicurezza.pos_duvri":
      case "comunicazione.avvio_cliente": {
        const elenco = (Array.isArray(v.valore) ? v.valore : [v.valore]) as PromemoriaDelPiano[];
        for (const p of elenco) {
          if (!p?.titolo?.trim()) continue;
          s.promemoria.push({
            tipo: p.tipo, titolo: p.titolo.trim(), scadenza: p.scadenza && DATA.test(p.scadenza) ? p.scadenza : null,
            testo: p.tipo === "avvio_cliente"
              ? `${p.canale && p.destinatario ? `Da mandare per ${p.canale === "email" ? "email" : "WhatsApp"} a ${p.destinatario}.\n\n` : ""}${p.testo}`
              : p.testo,
          });
        }
        continue;
      }
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

  // Un contratto solo per una ditta che entra nella commessa (o che c'è già, in «completa»).
  const ditteCommessa = s.modo === "completa" && giaNellaCommessa(piano, piano.aree.ditte?.["ditte.assegnate"]);
  const regContratti = REGISTRO.find((x) => x.chiave === "ditte.contratti")!;
  for (const c of contrattiAccettati) {
    if (!UUID.test(c.external_team_id)) continue;
    if (!ditteCommessa && !s.ditte.some((d) => d.external_team_id === c.external_team_id)) {
      fuori(regContratti, `${c.nome}: la ditta non è tra quelle confermate`);
      continue;
    }
    s.contratti.push({
      external_team_id: c.external_team_id, fasi: c.fasi ?? [], importo: Math.max(0, numero(c.importo) ?? 0),
      dal: c.dal && DATA.test(c.dal) ? c.dal : null, al: c.al && DATA.test(c.al) ? c.al : null,
      descrizione: `Lavorazioni delle fasi: ${(c.fasi ?? []).join(", ")}.`, elenco: Array.isArray(c.elenco) ? c.elenco : [],
    });
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
    + (s.condizioni ? 1 : 0) + (s.cliente.customer_id ? 1 : 0)
    + s.squadra.length + s.ditte.length + s.mezzi.length + s.oda.length + s.contratti.length + s.promemoria.length
    + (s.adempimenti?.length ?? 0);
}
