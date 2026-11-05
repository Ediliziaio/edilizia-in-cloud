/**
 * Persone, ditte, mezzi e acquisti della commessa (1/11/2026, fase 4, lotti 4.1–4.3).
 * Vedi docs/piano-silvio-commessa-ai.md, sezione 2 (aree 7–12) e fase 4.
 *
 * `proposteRisorse(piano, contesto)` legge le fasi della bozza e i dati veri dell'azienda (chi
 * ha fatto lavori simili, chi è già impegnato, i documenti delle ditte, i mezzi prenotati, i
 * fornitori abituali) e restituisce un Frammento di proposte 🟡 e bozze 🔴, con fonte
 * `modello`: passa da `fondi` come ogni lettore, e da `scritturaDalPiano` solo se la persona
 * lo accetta nel popup.
 *
 * Disponibilità vere (4.2): una persona già su un'altra commessa nelle stesse date, o in ferie;
 * un mezzo prenotato, fuori servizio o in officina; una ditta senza DURC valido per tutta la
 * fase o con documenti scaduti. Chi non è disponibile non si propone: si cerca il prossimo, e
 * se non c'è nessuno resta il migliore segnato ⚠ (`stato: "attenzione"`), che la scrittura
 * lascia fuori. Così nessuna proposta mette la stessa persona in due cantieri lo stesso giorno.
 *
 * Bozze (4.3): il contratto di ogni ditta proposta, gli ODA con la data d'ordine calcolata dai
 * tempi di consegna del fornitore, i promemoria di POS e DUVRI e il messaggio d'avvio al
 * cliente. Restano bozze: niente parte da solo, si mandano dalle pagine di sempre.
 *
 * Una variabile che il piano ha già da una fonte più fidata (una persona, la commessa, un
 * documento, un'offerta) non si tocca: le proposte riempiono solo quello che manca.
 *
 * Funzioni pure, senza dipendenze, compatibili con Deno.
 */
import { rangoFonte, spostaGiorniLavorativi, stessoValore, giaNellaCommessa } from "./fondi.ts";
import type { Area, CostoDelPiano, FaseDelPiano, Fonte, Frammento, PianoCommessa, SottofaseDelPiano, Valore } from "./piano.ts";
import { piuSimili, somiglianzaFasi, type FaseStorica } from "./somiglianza.ts";
import { dataConMese, aggiungiGiorni, dataCorta, eData, siSovrappongono } from "./date.ts";
import { livelloDellaVariabile, type Autonomia } from "./autonomia.ts";
import { CALENDARIO_NAZIONALE, type CalendarioCantiere } from "./calendario.ts";
import { adempimentiPrimaDiPartire, avvisiMeteo, avvisoMeteoInParole, avvisoScadenza, daFareSubito, type AdempimentoDelPiano } from "./partenza.ts";

// ── Le forme degli elenchi ──────────────────────────────────────────────────

/** «proposta»: si può accettare · «attenzione»: non disponibile, resta fuori dalla scrittura. */
export type StatoRisorsa = "proposta" | "attenzione";

interface Risorsa {
  /** Perché Silvio la propone, in italiano semplice. */
  motivo: string;
  stato: StatoRisorsa;
  /** Cosa non va (⚠), o un avvertimento che non la ferma («andava ordinato ieri»). */
  avviso?: string | null;
  /** Il ⚠ l'ha messo il ricontrollo dopo uno spostamento: se torna libera, torna a posto (G6). */
  daRicontrollo?: boolean;
}

/** Una persona in `persone.squadra` → `order_employees`. */
export interface PersonaDelPiano extends Risorsa {
  employee_id: string;
  nome: string;
  /** La fase (per nome); null = su tutta la commessa. */
  fase: string | null;
  dal?: string | null;
  al?: string | null;
}

/** Una ditta in `ditte.assegnate` → `order_external_teams`. */
export interface DittaDelPiano extends Risorsa {
  external_team_id: string;
  nome: string;
  fase: string;
  /** Costo previsto senza IVA (le ditte sono in reverse charge), dalle voci della fase. */
  costo_previsto: number;
  subappaltatore_id?: string | null;
}

/** Un mezzo in `mezzi.allocazioni` → `salva_piano_mezzo`. */
export interface MezzoDelPiano extends Risorsa {
  mezzo_id: string;
  nome: string;
  fasi: string[];
  dal: string | null;
  al: string | null;
  quantita: number;
}

export interface RigaOda {
  descrizione: string;
  quantita: number;
  unita?: string | null;
  /** Prezzo unitario senza IVA: solo da un'offerta. Senza offerta resta da chiedere. */
  prezzo?: number | null;
  iva?: number | null;
}

/** Un ordine al fornitore in `materiali.acquisti` → `purchase_orders` in bozza. */
export interface OdaDelPiano extends Risorsa {
  supplier_id: string;
  fornitore: string;
  fase: string | null;
  /** Quando serve in cantiere: l'inizio della fase. */
  data_consegna: string | null;
  /** Quando ordinarlo: consegna meno i tempi di consegna del fornitore. */
  data_ordine: string | null;
  giorni_consegna: number | null;
  righe: RigaOda[];
  /** L'offerta da cui viene (riga di `supplier_rfq_suppliers`), se c'è. */
  offerta_id?: string | null;
}

export interface VoceContratto {
  fase: string;
  descrizione: string;
  unita: string | null;
  quantita: number;
  prezzo: number;
  importo: number;
  codice: string | null;
}

/** Il contratto di una ditta in `ditte.contratti` → `contratti_subappalto` in bozza. */
export interface ContrattoDelPiano extends Risorsa {
  external_team_id: string;
  nome: string;
  subappaltatore_id: string | null;
  fasi: string[];
  dal: string | null;
  al: string | null;
  importo: number;
  elenco: VoceContratto[];
}

/** Un promemoria (POS, DUVRI) o il messaggio d'avvio → una riga in `tasks`, mai un invio. */
export interface PromemoriaDelPiano {
  tipo: "pos" | "duvri" | "avvio_cliente";
  titolo: string;
  testo: string;
  scadenza: string | null;
  /** Per il messaggio d'avvio: dove andrebbe, quando la persona lo manda. */
  canale?: "email" | "whatsapp" | null;
  destinatario?: string | null;
  /** La scadenza è già passata (revisione 2/11, G17). */
  avviso?: string | null;
}

// ── Il contesto: i dati veri dell'azienda ───────────────────────────────────

export interface ContestoRisorse {
  /** AAAA-MM-GG a Roma. */
  oggi: string;
  dipendenti: { id: string; nome: string; attivo: boolean }[];
  /** Le fasi fatte dai dipendenti nelle altre commesse. */
  storicoDipendenti: { employee_id: string; fase: string }[];
  /** Dove sono già impegnati, nelle altre commesse aperte: le date della fase o della commessa. */
  impegniDipendenti: { employee_id: string; commessa: string; dal: string | null; al: string | null }[];
  assenze: { employee_id: string; dal: string; al: string; tipo: string }[];
  /** Lo staff dell'azienda (useCompanyStaffUsers): mai i clienti. */
  staff: { id: string; nome: string }[];
  /** Il capomastro di ognuna delle altre commesse. */
  capomastri: string[];
  ditte: { id: string; nome: string; subappaltatore_id: string | null }[];
  storicoDitte: FaseStorica[];
  /** I documenti in vigore dei subappaltatori (anche il DURC delle schede di sicurezza). */
  documentiDitte: { subappaltatore_id: string; tipo: string; scadenza: string | null; esito?: string | null }[];
  mezzi: { id: string; nome: string; stato: string | null; gestione: string | null; quantita_totale: number | null }[];
  storicoMezzi: { mezzo_id: string; fase: string }[];
  impegniMezzi: { mezzo_id: string; commessa: string; dal: string | null; al: string | null; quantita: number }[];
  fornitori: { id: string; nome: string; lead_time_days: number | null }[];
  /** Le righe degli ordini passati: chi vende cosa. */
  storicoAcquisti: { supplier_id: string; descrizione: string }[];
}

export const FONTE_RISORSE: Fonte = { tipo: "modello", id: "silvio-risorse", etichetta: "Silvio: squadra, ditte, mezzi e acquisti" };

/** Al massimo quante persone per fase. */
const PERSONE_PER_FASE = 2;
/** I promemoria del POS: giorni lavorativi prima dell'inizio. */
const ANTICIPO_POS = 5;
/** Il messaggio d'avvio: giorni lavorativi prima dell'inizio. */
const ANTICIPO_AVVIO = 2;

// ── Le fasi della bozza, con le date che hanno ──────────────────────────────

export interface FaseDiLavoro {
  nome: string;
  dal: string | null;
  al: string | null;
  sottofasi: SottofaseDelPiano[];
}

/** Le fasi della bozza; in «completa» le date proposte (`fasi.date_fasi`) completano quelle senza date. */
export function fasiDiLavoro(piano: PianoCommessa): FaseDiLavoro[] {
  const fasi = piano.aree.fasi?.["fasi.order_work_phases"]?.valore;
  const date = piano.aree.fasi?.["fasi.date_fasi"]?.valore;
  if (!Array.isArray(fasi)) return [];
  const proposte = Array.isArray(date) ? (date as FaseDelPiano[]) : [];
  return (fasi as FaseDelPiano[])
    .filter((f) => typeof f?.name === "string" && f.name.trim())
    .map((f) => {
      const p = f.start_date ? null : proposte.find((x) => x.name?.trim().toLowerCase() === f.name.trim().toLowerCase());
      const dal = eData(f.start_date) ? f.start_date : eData(p?.start_date) ? p!.start_date! : null;
      const al = eData(f.end_date) ? f.end_date : eData(p?.end_date) ? p!.end_date! : null;
      return { nome: f.name.trim(), dal, al: dal && al && al >= dal ? al : dal, sottofasi: Array.isArray(f.sottofasi) ? f.sottofasi : [] };
    });
}

const stessoNome = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** La voce è già in un ordine al fornitore della stessa fase: il materiale lo compra l'impresa. */
const voceOrdinata = (ordini: readonly OdaDelPiano[], fase: string, voce: string) => ordini.some((o) => o.stato !== "attenzione" && o.fase === fase
  && Array.isArray(o.righe) && o.righe.some((r) => stessoNome(r.descrizione, voce)));

/**
 * Il costo previsto di una fase, senza IVA: le sue voci, o il costo della fase in `costi.previsti`.
 * Le voci già ordinate non si contano (revisione 2/11, G7): il contratto della ditta le toglieva,
 * il suo costo previsto no, e lo stesso materiale pesava due volte sul margine.
 */
export function costoDellaFase(piano: PianoCommessa, fase: FaseDiLavoro, ordini: readonly OdaDelPiano[] = []): number {
  const voci = fase.sottofasi.reduce((t, s) => t + (Number(s.costo) || 0), 0);
  if (voci > 0) {
    const daPagare = fase.sottofasi.filter((s) => !voceOrdinata(ordini, fase.nome, s.name)).reduce((t, s) => t + (Number(s.costo) || 0), 0);
    return Math.round(daPagare * 100) / 100;
  }
  const costi = piano.aree.costi?.["costi.previsti"]?.valore;
  const c = Array.isArray(costi)
    ? (costi as CostoDelPiano[]).find((x) => x.fase?.trim().toLowerCase() === fase.nome.toLowerCase()) : undefined;
  return Math.round((Number(c?.importo) || 0) * 100) / 100;
}

// ── Le disponibilità (4.2) ──────────────────────────────────────────────────

const periodo = (dal: string | null, al: string | null) => (dal ? `dal ${dataCorta(dal)}${al && al !== dal ? ` al ${dataCorta(al)}` : ""}` : "");

/** Perché una persona non può stare in quel periodo, o null se è libera. Senza date non si sa: libera. */
export function personaOccupata(ctx: ContestoRisorse, employeeId: string, dal: string | null, al: string | null): string | null {
  if (!dal) return null;
  const qui = { dal, al: al ?? dal };
  const assenza = ctx.assenze.find((a) => a.employee_id === employeeId && siSovrappongono(qui, { dal: a.dal, al: a.al }));
  if (assenza) return `è assente (${assenza.tipo || "assenza"}) ${periodo(assenza.dal, assenza.al)}`;
  const impegno = ctx.impegniDipendenti.find((i) => i.employee_id === employeeId && siSovrappongono(qui, i));
  if (impegno) return `è già sulla commessa ${impegno.commessa} ${periodo(impegno.dal, impegno.al)}`;
  return null;
}

/** Perché un mezzo non è libero in quel periodo, o null. */
export function mezzoOccupato(ctx: ContestoRisorse, mezzoId: string, dal: string | null, al: string | null, quantita = 1): string | null {
  const m = ctx.mezzi.find((x) => x.id === mezzoId);
  if (!m) return "non c'è più tra i mezzi";
  if (m.stato === "fuori_servizio") return "è fuori servizio";
  if (m.stato === "in_officina") return "è in officina";
  if (!dal) return null;
  const qui = { dal, al: al ?? dal };
  const sovrapposti = ctx.impegniMezzi.filter((i) => i.mezzo_id === mezzoId && siSovrappongono(qui, i));
  if ((m.gestione ?? "singola") === "quantita") {
    const usati = sovrapposti.reduce((t, i) => t + (Number(i.quantita) || 0), 0);
    const totale = Number(m.quantita_totale) || 0;
    return usati + quantita > totale ? `ne restano ${Math.max(0, totale - usati)} su ${totale} in quei giorni` : null;
  }
  const primo = sovrapposti[0];
  return primo ? `è già prenotato per la commessa ${primo.commessa} ${periodo(primo.dal, primo.al)}` : null;
}

const NOMI_DOCUMENTI: Record<string, string> = {
  durc: "DURC", visura: "visura camerale", polizza_rc: "polizza RC", iscrizione_albo: "iscrizione all'albo",
  formazione_operai: "formazione degli operai", pos: "POS", altro: "documento",
};

/**
 * Cosa non va nei documenti di una ditta per lavorare fino al `finoAl`: senza subappaltatore
 * collegato non c'è DURC da controllare; il DURC deve coprire tutta la fase e non essere
 * irregolare; nessun documento scaduto, né in scadenza prima della fine. Null se è tutto a posto.
 */
export function documentiDitta(ctx: ContestoRisorse, ditta: ContestoRisorse["ditte"][number], finoAl: string | null): string | null {
  if (!ditta.subappaltatore_id) return "non è collegata a un subappaltatore: non ha un DURC da controllare";
  const docs = ctx.documentiDitte.filter((d) => d.subappaltatore_id === ditta.subappaltatore_id);
  const serveFino = finoAl && finoAl > ctx.oggi ? finoAl : ctx.oggi;
  const durc = docs.filter((d) => d.tipo === "durc" && eData(d.scadenza))
    .sort((a, b) => (b.scadenza! > a.scadenza! ? 1 : -1))[0];
  if (!durc) return "non ha un DURC caricato";
  if (/irregolar/i.test(durc.esito ?? "")) return "il DURC risulta irregolare";
  if (durc.scadenza! < ctx.oggi) return `il DURC è scaduto il ${dataCorta(durc.scadenza!)}`;
  if (durc.scadenza! < serveFino) return `il DURC scade il ${dataCorta(durc.scadenza!)}, prima della fine della fase`;
  const nomi = (xs: typeof docs) => [...new Set(xs.map((d) => NOMI_DOCUMENTI[d.tipo] ?? d.tipo))].join(", ");
  const altri = docs.filter((d) => d.tipo !== "durc" && eData(d.scadenza));
  const scaduti = altri.filter((d) => d.scadenza! < ctx.oggi);
  if (scaduti.length) return `ha documenti scaduti: ${nomi(scaduti)}`;
  // Come il DURC, gli altri documenti devono coprire tutta la fase, non solo oggi (revisione 1/11, L14).
  const inScadenza = altri.filter((d) => d.scadenza! < serveFino);
  if (inScadenza.length) return `ha documenti che scadono prima della fine della fase: ${nomi(inScadenza)}`;
  return null;
}

// ── Le proposte ─────────────────────────────────────────────────────────────

/** La variabile si può proporre: non c'è, o l'ha messa Silvio stesso (si rifà). */
function libera(piano: PianoCommessa, area: Area, chiave: string): boolean {
  const v = piano.aree[area]?.[chiave];
  if (!v) return true;
  if (giaNellaCommessa(piano, v) || v.fonte.tipo === "persona" || v.toccato) return false;
  if (v.fonte.id === FONTE_RISORSE.id) return true;
  return rangoFonte(v.fonte) > rangoFonte(FONTE_RISORSE);
}

const senzaDate = "le fasi non hanno ancora le date: la disponibilità si controlla quando le avranno";

function squadra(fasi: FaseDiLavoro[], ctx: ContestoRisorse): PersonaDelPiano[] {
  const attivi = new Set(ctx.dipendenti.filter((d) => d.attivo).map((d) => d.id));
  const nome = (id: string) => ctx.dipendenti.find((d) => d.id === id)?.nome ?? "Dipendente";
  const storico = ctx.storicoDipendenti.filter((s) => attivi.has(s.employee_id)).map((s) => ({ id: s.employee_id, nome: s.fase }));
  const out: PersonaDelPiano[] = [];
  for (const f of fasi) {
    const candidati = piuSimili(f.nome, storico);
    if (!candidati.length) continue;
    const scelti = candidati.filter((c) => !personaOccupata(ctx, c.id, f.dal, f.al)).slice(0, PERSONE_PER_FASE);
    for (const c of scelti) {
      out.push({
        employee_id: c.id, nome: nome(c.id), fase: f.nome, dal: f.dal, al: f.al, stato: "proposta",
        motivo: `ha fatto ${c.volte === 1 ? "una fase simile" : `${c.volte} fasi simili`} («${c.come}»)`,
        avviso: f.dal ? null : senzaDate,
      });
    }
    if (!scelti.length) {
      const c = candidati[0];
      out.push({
        employee_id: c.id, nome: nome(c.id), fase: f.nome, dal: f.dal, al: f.al, stato: "attenzione",
        motivo: `è chi fa di solito «${c.come}»`,
        avviso: `${nome(c.id)} ${personaOccupata(ctx, c.id, f.dal, f.al)}: scegli un'altra persona`,
      });
    }
  }
  return out;
}

function capomastro(ctx: ContestoRisorse): { id: string; nome: string; volte: number } | null {
  const staff = new Map(ctx.staff.map((s) => [s.id, s.nome]));
  const conti = new Map<string, number>();
  for (const id of ctx.capomastri) if (staff.has(id)) conti.set(id, (conti.get(id) ?? 0) + 1);
  const [primo] = [...conti.entries()].sort((a, b) => b[1] - a[1]);
  return primo ? { id: primo[0], nome: staff.get(primo[0])!, volte: primo[1] } : null;
}

function ditte(fasi: FaseDiLavoro[], ctx: ContestoRisorse, piano: PianoCommessa, ordini: readonly OdaDelPiano[]): DittaDelPiano[] {
  const perId = new Map(ctx.ditte.map((d) => [d.id, d]));
  const storico = ctx.storicoDitte.filter((s) => perId.has(s.external_team_id)).map((s) => ({ id: s.external_team_id, nome: s.fase }));
  const out: DittaDelPiano[] = [];
  for (const f of fasi) {
    const candidati = piuSimili(f.nome, storico);
    if (!candidati.length) continue;
    const costo = costoDellaFase(piano, f, ordini);
    const riga = (c: (typeof candidati)[number], avviso: string | null): DittaDelPiano => {
      const d = perId.get(c.id)!;
      return {
        external_team_id: d.id, nome: d.nome, fase: f.nome, costo_previsto: costo, subappaltatore_id: d.subappaltatore_id,
        motivo: `ha fatto ${c.volte === 1 ? "una fase simile" : `${c.volte} fasi simili`} («${c.come}»)`,
        stato: avviso ? "attenzione" : "proposta",
        avviso: avviso ?? (costo > 0 ? null : "la fase non ha voci con un costo: il costo previsto resta da mettere"),
      };
    };
    const buona = candidati.find((c) => !documentiDitta(ctx, perId.get(c.id)!, f.al));
    if (buona) {
      const prima = candidati[0];
      const r = riga(buona, null);
      if (buona.id !== prima.id) {
        r.motivo += `; ${perId.get(prima.id)!.nome}, che la fa più spesso, ${documentiDitta(ctx, perId.get(prima.id)!, f.al)}`;
      }
      out.push(r);
    } else {
      const c = candidati[0];
      out.push(riga(c, `${perId.get(c.id)!.nome} ${documentiDitta(ctx, perId.get(c.id)!, f.al)}`));
    }
  }
  return out;
}

/**
 * I periodi in cui prenotare un mezzo per quelle fasi. Una prenotazione sola se è libero per
 * tutto il tempo; se qualcuno lo ha prenotato nel buco fra due fasi, una per fase (revisione 2/11,
 * G16): prima risultava occupato, e prenotarlo di fila sarebbe finito sopra l'altra commessa.
 */
function periodiDelMezzo(ctx: ContestoRisorse, id: string, fasi: readonly FaseDiLavoro[], quantita = 1): { fasi: FaseDiLavoro[]; dal: string | null; al: string | null; occupato: string | null }[] {
  const periodo = (gruppo: FaseDiLavoro[]) => {
    const dal = gruppo.map((f) => f.dal).filter((d): d is string => !!d).sort()[0] ?? null;
    const al = gruppo.map((f) => f.al ?? f.dal).filter((d): d is string => !!d).sort().at(-1) ?? null;
    return { fasi: gruppo, dal, al, occupato: mezzoOccupato(ctx, id, dal, al, quantita) };
  };
  const unico = periodo([...fasi]);
  if (!unico.occupato || fasi.length < 2) return [unico];
  const singoli = fasi.map((f) => periodo([f]));
  return singoli.some((p) => p.occupato) ? [unico] : singoli;
}

function mezzi(fasi: FaseDiLavoro[], ctx: ContestoRisorse): MezzoDelPiano[] {
  const usabili = new Set(ctx.mezzi.map((m) => m.id));
  const storico = ctx.storicoMezzi.filter((s) => usabili.has(s.mezzo_id)).map((s) => ({ id: s.mezzo_id, nome: s.fase }));
  // Un mezzo per fase, il primo libero; lo stesso mezzo su più fasi diventa una prenotazione sola.
  const perMezzo = new Map<string, { fasi: FaseDiLavoro[]; come: string; volte: number }>();
  const occupati: MezzoDelPiano[] = [];
  for (const f of fasi) {
    const candidati = piuSimili(f.nome, storico);
    if (!candidati.length) continue;
    const libero = candidati.find((c) => !mezzoOccupato(ctx, c.id, f.dal, f.al));
    if (libero) {
      const g = perMezzo.get(libero.id) ?? { fasi: [], come: libero.come, volte: 0 };
      g.fasi.push(f);
      g.volte = Math.max(g.volte, libero.volte);
      perMezzo.set(libero.id, g);
    } else {
      const c = candidati[0];
      const m = ctx.mezzi.find((x) => x.id === c.id)!;
      occupati.push({
        mezzo_id: c.id, nome: m.nome, fasi: [f.nome], dal: f.dal, al: f.al, quantita: 1, stato: "attenzione",
        motivo: `si usa di solito in «${c.come}»`, avviso: `${m.nome} ${mezzoOccupato(ctx, c.id, f.dal, f.al)}: scegline un altro`,
      });
    }
  }
  const out: MezzoDelPiano[] = [];
  for (const [id, g] of perMezzo) {
    const m = ctx.mezzi.find((x) => x.id === id)!;
    // Sulle fasi unite il periodo è più lungo: si ricontrolla.
    for (const { fasi: gruppo, dal, al, occupato } of periodiDelMezzo(ctx, id, g.fasi)) {
      out.push({
        mezzo_id: id, nome: m.nome, fasi: gruppo.map((f) => f.nome), dal, al, quantita: 1,
        motivo: `si usa di solito in «${g.come}»`,
        stato: occupato ? "attenzione" : "proposta",
        avviso: occupato ? `${m.nome} ${occupato}` : dal ? null : senzaDate,
      });
    }
  }
  return [...out, ...occupati];
}

/** Quando ordinare: la consegna meno i giorni del fornitore (di calendario, come li scrivono). */
export function dataOrdine(consegna: string | null, giorniConsegna: number | null): string | null {
  if (!consegna) return null;
  return aggiungiGiorni(consegna, -Math.max(0, Math.round(giorniConsegna ?? 0)));
}

function avvisoOrdine(oggi: string, ordine: string | null, giorni: number | null): string | null {
  if (!ordine) return "la fase non ha ancora la data: la data d'ordine arriva con le date";
  if (giorni == null) return "il fornitore non ha i tempi di consegna in anagrafica: ordine alla data della consegna";
  if (ordine < oggi) return `da ordinare subito, andava ordinato entro il ${dataConMese(ordine)}: chiedi al fornitore se ce la fa`;
  return null;
}

function acquisti(fasi: FaseDiLavoro[], ctx: ContestoRisorse): OdaDelPiano[] {
  const fornitori = new Map(ctx.fornitori.map((f) => [f.id, f]));
  const storico = ctx.storicoAcquisti.filter((s) => fornitori.has(s.supplier_id)).map((s) => ({ id: s.supplier_id, nome: s.descrizione }));
  if (!storico.length) return [];
  const out: OdaDelPiano[] = [];
  for (const f of fasi) {
    const perFornitore = new Map<string, RigaOda[]>();
    for (const s of f.sottofasi) {
      if (typeof s?.name !== "string" || !s.name.trim()) continue;
      const [migliore] = piuSimili(s.name, storico);
      if (!migliore) continue;
      const righe = perFornitore.get(migliore.id) ?? [];
      righe.push({ descrizione: s.name.trim(), quantita: Number(s.quantita) > 0 ? Number(s.quantita) : 1, unita: s.unita ?? null, prezzo: null });
      perFornitore.set(migliore.id, righe);
    }
    for (const [id, righe] of perFornitore) {
      const forn = fornitori.get(id)!;
      const ordine = dataOrdine(f.dal, forn.lead_time_days);
      out.push({
        supplier_id: id, fornitore: forn.nome, fase: f.nome, data_consegna: f.dal, data_ordine: ordine,
        giorni_consegna: forn.lead_time_days, righe, stato: "proposta",
        motivo: `è il fornitore abituale di ${righe.length === 1 ? "questa voce" : `queste ${righe.length} voci`}; i prezzi si chiedono a lui`,
        avviso: avvisoOrdine(ctx.oggi, ordine, forn.lead_time_days),
      });
    }
  }
  return out;
}

const tondo = (n: number) => Math.round(n * 100) / 100;

/**
 * Il contratto di ogni ditta proposta: le voci delle sue fasi, al costo previsto. Le voci già in
 * un ordine al fornitore della stessa fase restano fuori (revisione 1/11): il materiale comprato
 * dall'impresa non si paga anche alla ditta, e il costo non si conta due volte.
 */
export function contrattiDelleDitte(
  ditteProposte: readonly DittaDelPiano[], fasi: readonly FaseDiLavoro[], ordini: readonly OdaDelPiano[] = [],
): ContrattoDelPiano[] {
  const ordinata = (fase: string, voce: string) => voceOrdinata(ordini, fase, voce);
  const perDitta = new Map<string, DittaDelPiano[]>();
  for (const d of ditteProposte) {
    if (d.stato === "attenzione") continue;
    perDitta.set(d.external_team_id, [...(perDitta.get(d.external_team_id) ?? []), d]);
  }
  return [...perDitta.values()].map((righe) => {
    const prima = righe[0];
    const sue = fasi.filter((f) => righe.some((r) => r.fase === f.nome));
    const elenco: VoceContratto[] = sue.flatMap((f) => f.sottofasi
      .filter((s) => typeof s?.name === "string" && s.name.trim() && !ordinata(f.nome, s.name))
      .map((s) => {
        const quantita = Number(s.quantita) > 0 ? Number(s.quantita) : 1;
        const importo = tondo(Number(s.costo) || 0);
        return { fase: f.nome, descrizione: s.name.trim(), unita: s.unita ?? null, quantita, prezzo: tondo(importo / quantita), importo, codice: s.codice ?? null };
      }));
    // Le fasi senza voci entrano col loro costo previsto, a corpo.
    for (const r of righe) {
      if (!elenco.some((v) => v.fase === r.fase) && r.costo_previsto > 0) {
        elenco.push({ fase: r.fase, descrizione: `Lavori della fase ${r.fase}, a corpo`, unita: "a corpo", quantita: 1, prezzo: r.costo_previsto, importo: r.costo_previsto, codice: null });
      }
    }
    const inizi = sue.map((f) => f.dal).filter((d): d is string => !!d).sort();
    const fini = sue.map((f) => f.al ?? f.dal).filter((d): d is string => !!d).sort();
    const importo = tondo(elenco.reduce((t, v) => t + v.importo, 0));
    const avviso = !prima.subappaltatore_id
      ? "la ditta non è collegata a un subappaltatore: collegala dalla sua scheda, poi il contratto si prepara"
      : importo > 0 ? null : "nessuna voce con un costo: l'importo del contratto resta da scrivere";
    return {
      external_team_id: prima.external_team_id, nome: prima.nome, subappaltatore_id: prima.subappaltatore_id ?? null,
      fasi: righe.map((r) => r.fase), dal: inizi[0] ?? null, al: fini.at(-1) ?? null, importo, elenco,
      motivo: "bozza con l'Allegato A dei lavori: si firma dalla pagina della commessa",
      stato: prima.subappaltatore_id ? "proposta" : "attenzione", avviso,
    };
  });
}

function testoCliente(piano: PianoCommessa, inizio: string | null): { testo: string; canale: "email" | "whatsapp" | null; destinatario: string | null } {
  const nome = piano.aree.cliente?.["cliente.nome"]?.valore as { client_name?: string; client_company?: string } | undefined;
  const contatto = piano.aree.cliente?.["cliente.contatto"]?.valore as { client_email?: string; client_phone?: string } | undefined;
  const lavori = piano.aree.identita?.["identita.description"]?.valore;
  const indirizzo = piano.aree.cantiere?.["cantiere.indirizzo"]?.valore as { indirizzo_lavori?: string; work_address?: string } | string | undefined;
  const dove = typeof indirizzo === "string" ? indirizzo : indirizzo?.indirizzo_lavori ?? indirizzo?.work_address ?? null;
  const chi = nome?.client_name?.trim() || nome?.client_company?.trim() || null;
  const testo = [
    chi ? `Buongiorno ${chi},` : "Buongiorno,",
    `le confermiamo l'inizio dei lavori${typeof lavori === "string" && lavori.trim() ? ` di «${lavori.trim()}»` : ""}`
      + `${dove ? ` in ${dove}` : ""}${inizio ? ` dal ${dataCorta(inizio)}` : ""}.`,
    "Nei prossimi giorni le scriviamo chi sarà in cantiere e come organizzarci per l'accesso.",
    "Per qualsiasi necessità può rispondere a questo messaggio.",
  ].join("\n");
  const email = contatto?.client_email?.includes("@") ? contatto.client_email.trim() : null;
  const telefono = contatto?.client_phone?.trim() || null;
  return { testo, canale: email ? "email" : telefono ? "whatsapp" : null, destinatario: email ?? telefono };
}

/**
 * Il contratto di una ditta tolta da una fase e rimasta sulle altre (revisione 2/11, G16): resta,
 * senza quella fase, con l'importo e le date delle altre. Prima spariva intero.
 */
export function contrattoSenzaFase(c: ContrattoDelPiano, fase: string, fasi: readonly FaseDiLavoro[]): ContrattoDelPiano {
  const restano = (c.fasi ?? []).filter((f) => f !== fase);
  const elenco = (c.elenco ?? []).filter((v) => v.fase !== fase);
  const sue = fasi.filter((f) => restano.includes(f.nome));
  const inizi = sue.map((f) => f.dal).filter((d): d is string => !!d).sort();
  const fini = sue.map((f) => f.al ?? f.dal).filter((d): d is string => !!d).sort();
  return { ...c, fasi: restano, elenco, importo: tondo(elenco.reduce((t, v) => t + (Number(v.importo) || 0), 0)), dal: inizi[0] ?? c.dal, al: fini.at(-1) ?? c.al };
}

function promemoriaSicurezza(fasi: FaseDiLavoro[], inizio: string | null, conDitte: boolean, cal: CalendarioCantiere, oggi: string): PromemoriaDelPiano[] {
  const primo = inizio ?? fasi.map((f) => f.dal).filter((d): d is string => !!d).sort()[0] ?? null;
  const entro = primo ? spostaGiorniLavorativi(primo, -ANTICIPO_POS, cal) : null;
  const out: PromemoriaDelPiano[] = [{
    tipo: "pos", titolo: "Prepara il POS del cantiere", scadenza: entro,
    testo: "Il Piano Operativo di Sicurezza va pronto prima che si entri in cantiere. Si prepara da Sicurezza della commessa; lo firma il datore di lavoro.",
  }];
  if (conDitte) {
    out.push({
      tipo: "duvri", titolo: "Coordina la sicurezza con le ditte (DUVRI o PSC, e i loro POS)", scadenza: entro,
      testo: "Con ditte in cantiere servono il DUVRI (o il PSC, se c'è il coordinatore) e il POS di ogni ditta prima che entri. Si preparano da Sicurezza della commessa.",
    });
  }
  return out.map((p) => ({ ...p, avviso: avvisoScadenza(p.scadenza, oggi) }));
}

/** «⚠ Già passate: …», da mettere nella nota: la scadenza nel passato si deve vedere (G17). */
function notaScadenzePassate(elenco: readonly { titolo: string; scadenza?: string | null; avviso?: string | null }[]): string {
  const passate = elenco.filter((x) => x.avviso);
  return passate.length ? ` ⚠ ${passate.map((x) => (x.scadenza ? daFareSubito(x.titolo, x.scadenza) : `Da fare subito: ${x.titolo}`)).join("; ")}.` : "";
}

// ── Il ricontrollo di quello che è già stato accettato (revisione 2/11, G6) ──────

/** Da ⚠ a posto, o da a posto a ⚠: solo il ricontrollo disfa quello che ha fatto il ricontrollo. */
function ricontrollata<T extends Risorsa>(x: T, problema: string | null): T {
  if (problema) return { ...x, stato: "attenzione", avviso: problema, daRicontrollo: true };
  if (!x.daRicontrollo) return x;
  const { daRicontrollo: _d, ...resto } = x;
  return { ...resto, stato: "proposta", avviso: null } as unknown as T;
}

const faseSparita = (nome: string) => `la fase «${nome}» non c'è più: scegli dove metterla, o toglila`;

/**
 * Le risorse accettate con le date di adesso. `proposteRisorse` non le rifà, perché le ha decise
 * una persona: ma le date e le disponibilità le dicono le fasi e l'azienda. Le date si
 * riallineano; chi non è più libero o non ha più la fase diventa ⚠ col motivo, e la scrittura lo
 * lascia fuori. Niente sparisce e niente si sostituisce: decide la persona.
 */
function riallineaSquadra(lista: PersonaDelPiano[], fasi: readonly FaseDiLavoro[], ctx: ContestoRisorse): PersonaDelPiano[] {
  return lista.map((p) => {
    if (!p?.fase) return p;
    const f = fasi.find((x) => stessoNome(x.nome, p.fase));
    if (!f) return ricontrollata(p, faseSparita(p.fase));
    const occupata = personaOccupata(ctx, p.employee_id, f.dal, f.al);
    return ricontrollata({ ...p, dal: f.dal, al: f.al }, occupata ? `${p.nome} ${occupata}: scegli un'altra persona` : null);
  });
}

function riallineaDitte(lista: DittaDelPiano[], fasi: readonly FaseDiLavoro[], ctx: ContestoRisorse): DittaDelPiano[] {
  return lista.map((d) => {
    const f = fasi.find((x) => stessoNome(x.nome, d?.fase));
    if (!f) return ricontrollata(d, faseSparita(d?.fase));
    const ditta = ctx.ditte.find((x) => x.id === d.external_team_id);
    const documenti = ditta ? documentiDitta(ctx, ditta, f.al) : null;
    return ricontrollata(d, documenti ? `${d.nome} ${documenti}` : null);
  });
}

function riallineaMezzi(lista: MezzoDelPiano[], fasi: readonly FaseDiLavoro[], ctx: ContestoRisorse): MezzoDelPiano[] {
  return lista.flatMap((m) => {
    if (!Array.isArray(m?.fasi) || !m.fasi.length) return [m];
    const sue = fasi.filter((f) => m.fasi.some((n) => stessoNome(n, f.nome)));
    if (!sue.length) return [ricontrollata(m, faseSparita(m.fasi.join(", ")))];
    return periodiDelMezzo(ctx, m.mezzo_id, sue, m.quantita).map(({ fasi: gruppo, dal, al, occupato }) => ricontrollata(
      { ...m, fasi: gruppo.map((f) => f.nome), dal, al }, occupato ? `${m.nome} ${occupato}` : null,
    ));
  });
}

function riallineaOrdini(lista: OdaDelPiano[], fasi: readonly FaseDiLavoro[], oggi: string): OdaDelPiano[] {
  return lista.map((o) => {
    if (!o?.fase) return o;
    const f = fasi.find((x) => stessoNome(x.nome, o.fase));
    if (!f) return ricontrollata(o, faseSparita(o.fase));
    const a_posto = ricontrollata(o, null);
    if (a_posto.data_consegna === f.dal) return a_posto;
    const ordine = dataOrdine(f.dal, o.giorni_consegna);
    return { ...a_posto, data_consegna: f.dal, data_ordine: ordine, avviso: avvisoOrdine(oggi, ordine, o.giorni_consegna) };
  });
}

function riallineaContratti(lista: ContrattoDelPiano[], fasi: readonly FaseDiLavoro[]): ContrattoDelPiano[] {
  return lista.map((c) => {
    const sue = fasi.filter((f) => (c?.fasi ?? []).some((n) => stessoNome(n, f.nome)));
    if (!sue.length) return c;
    const inizi = sue.map((f) => f.dal).filter((d): d is string => !!d).sort();
    const fini = sue.map((f) => f.al ?? f.dal).filter((d): d is string => !!d).sort();
    return { ...c, dal: inizi[0] ?? null, al: fini.at(-1) ?? null };
  });
}

/** Scadenze e testi dei promemoria accettati, da quelli che Silvio scriverebbe adesso, per tipo. */
function riallineaPerTipo<T extends { tipo: string; scadenza: string | null }>(lista: T[], nuovi: readonly T[]): T[] {
  return lista.map((x) => {
    const n = nuovi.find((y) => y.tipo === x?.tipo);
    return n ? { ...x, scadenza: n.scadenza, ...("testo" in n ? { testo: n.testo } : {}), avviso: (n as { avviso?: string | null }).avviso ?? null } as T : x;
  });
}

/**
 * Le proposte di Silvio per persone, ditte, mezzi e acquisti, e le bozze collegate. Null se
 * la bozza non ha ancora le fasi o non c'è niente da proporre.
 *
 * Fase 5: le azioni che il titolare ha vietato (`autonomia`) non si propongono; le date dei
 * promemoria seguono il calendario dell'azienda (`piano.calendario`); in più gli avvisi meteo
 * delle fasi all'aperto e gli adempimenti prima di partire (partenza.ts).
 */
export function proposteRisorse(piano: PianoCommessa, ctx: ContestoRisorse, autonomia?: Autonomia | null): Frammento | null {
  const fasi = fasiDiLavoro(piano);
  if (!fasi.length) return null;
  const cal = piano.calendario ?? CALENDARIO_NAZIONALE;
  const inizio = piano.aree.fasi?.["fasi.work_start_date"]?.valore;
  const dataInizio = eData(inizio) ? inizio : fasi.map((f) => f.dal).filter((d): d is string => !!d).sort()[0] ?? null;
  const aree: Frammento["aree"] = {};
  const metti = (area: Area, chiave: string, valore: unknown, nota: string, fiducia = 0.6, stato: Valore["stato"] = "proposta") => {
    if (livelloDellaVariabile(autonomia, chiave) === "vietata") return;
    if (!libera(piano, area, chiave)) return;
    if (Array.isArray(valore) && !valore.length) return;
    aree[area] = { ...(aree[area] ?? {}), [chiave]: { valore, fiducia, stato, nota } };
  };
  const contaAvvisi = (r: Array<{ stato: StatoRisorsa }>) => r.filter((x) => x.stato === "attenzione").length;
  const notaElenco = (r: Array<{ stato: StatoRisorsa }>, cosa: string) => {
    const n = contaAvvisi(r);
    return `${cosa}${n ? `. ⚠ ${n === 1 ? "Uno non è disponibile" : `${n} non sono disponibili`}: resta${n === 1 ? "" : "no"} fuori finché non ${n === 1 ? "lo cambi" : "li cambi"}.` : "."}`
      + " Entra nella commessa se la confermi.";
  };

  const oggi = ctx.oggi;
  const persone = squadra(fasi, ctx);
  metti("persone", "persone.squadra", persone, notaElenco(persone, "Chi ha fatto più spesso fasi simili, libero nelle date delle fasi"));

  const capo = capomastro(ctx);
  if (capo) metti("persone", "persone.capomastro", capo.id, `${capo.nome}: capomastro di ${capo.volte === 1 ? "un'altra commessa" : `${capo.volte} commesse`}. Entra se lo confermi.`, 0.5);

  // Prima gli ordini: il costo di una ditta non conta le voci che compra l'impresa (G7).
  const oda = acquisti(fasi, ctx);
  metti("materiali", "materiali.acquisti", oda,
    "Ordini in bozza al fornitore abituale, con la data d'ordine dai suoi tempi di consegna. Non parte niente: si mandano dalla pagina dell'ordine.");
  const odaDelPiano = (aree.materiali?.["materiali.acquisti"]?.valore ?? piano.aree.materiali?.["materiali.acquisti"]?.valore) as OdaDelPiano[] | undefined;
  const ordiniDelPiano = Array.isArray(odaDelPiano) ? odaDelPiano : [];

  const proposteDitte = ditte(fasi, ctx, piano, ordiniDelPiano);
  metti("ditte", "ditte.assegnate", proposteDitte, notaElenco(proposteDitte, "La ditta che fa di solito quel lavoro, con un DURC che copre la fase"));

  const proposteMezzi = mezzi(fasi, ctx);
  metti("mezzi", "mezzi.allocazioni", proposteMezzi, notaElenco(proposteMezzi, "I mezzi usati di solito in queste fasi, liberi in quei giorni"));

  // Le bozze 🔴 seguono le proposte: il contratto c'è per le ditte che entrano.
  const ditteDelPiano = (aree.ditte?.["ditte.assegnate"]?.valore ?? piano.aree.ditte?.["ditte.assegnate"]?.valore) as DittaDelPiano[] | undefined;
  if (Array.isArray(ditteDelPiano)) {
    const contratti = contrattiDelleDitte(ditteDelPiano, fasi, ordiniDelPiano);
    metti("ditte", "ditte.contratti", contratti,
      "Il contratto di subappalto di ogni ditta, in bozza con l'elenco dei lavori. Si firma dalla pagina della commessa: Silvio non lo manda.", 0.5);
  }
  const conDitte = Array.isArray(ditteDelPiano) && ditteDelPiano.some((d) => d.stato !== "attenzione");
  const promemoria = promemoriaSicurezza(fasi, dataInizio, conDitte, cal, oggi);
  metti("sicurezza", "sicurezza.pos_duvri", promemoria,
    `Promemoria nelle attività della commessa, con la scadenza prima dell'inizio. I documenti si preparano e si firmano da Sicurezza.${notaScadenzePassate(promemoria)}`, 0.8);

  const cliente = testoCliente(piano, dataInizio);
  const avvio: PromemoriaDelPiano = {
    tipo: "avvio_cliente", titolo: "Manda al cliente il messaggio d'avvio lavori", testo: cliente.testo,
    scadenza: dataInizio ? spostaGiorniLavorativi(dataInizio, -ANTICIPO_AVVIO, cal) : null,
    canale: cliente.canale, destinatario: cliente.destinatario,
  };
  avvio.avviso = avvisoScadenza(avvio.scadenza, oggi);
  metti("comunicazione", "comunicazione.avvio_cliente", avvio,
    "Il testo resta in bozza in un'attività della commessa: lo mandi tu, quando vuoi. Silvio non lo invia.", 0.8);

  // ── Fase 5: prima di partire ──
  const meteo = avvisiMeteo(fasi);
  if (meteo.length) {
    metti("fasi", "fasi.avvisi_meteo", meteo,
      `Fasi all'aperto in mesi a rischio: ${meteo.map(avvisoMeteoInParole).join(" ")} È una regola di stagione, non una previsione.`, 0.7, "fatto");
  } else {
    // Spostate le fasi fuori dai mesi a rischio, l'avviso di prima non vale più (G19).
    const vecchio = piano.aree.fasi?.["fasi.avvisi_meteo"];
    if (Array.isArray(vecchio?.valore) && vecchio!.valore.length && libera(piano, "fasi", "fasi.avvisi_meteo")) {
      aree.fasi = { ...(aree.fasi ?? {}), "fasi.avvisi_meteo": { valore: [], fiducia: 0.7, stato: "manca", nota: null } };
    }
  }
  const squadraFasi = (aree.persone?.["persone.squadra"]?.valore ?? piano.aree.persone?.["persone.squadra"]?.valore) as PersonaDelPiano[] | undefined;
  const lavoro = [piano.aree.identita?.["identita.tipo_lavoro"]?.valore, piano.aree.identita?.["identita.description"]?.valore,
    piano.aree.identita?.["identita.work_description"]?.valore].filter((x): x is string => typeof x === "string").join(" · ");
  const adempimenti = adempimentiPrimaDiPartire({
    lavoro, inizio: dataInizio, oggi,
    ditte: Array.isArray(ditteDelPiano) ? new Set(ditteDelPiano.filter((d) => d.stato !== "attenzione").map((d) => d.external_team_id)).size : 0,
    fasi: fasi.map((f) => ({
      nome: f.nome, dal: f.dal, al: f.al,
      persone: Array.isArray(squadraFasi) ? squadraFasi.filter((p) => p.fase === f.nome && p.stato !== "attenzione").length : null,
    })),
  }, cal);
  metti("sicurezza", "sicurezza.adempimenti", adempimenti,
    `Scadenze della commessa prima di aprire il cantiere. Silvio non sa se il tecnico le ha già fatte: si spuntano dalla Sicurezza della commessa.${notaScadenzePassate(adempimenti)}`, 0.7);

  // Quello che una persona ha già accettato: si riallinea, e torna al popup solo se cambia (G6).
  const riallinea = <T>(area: Area, chiave: string, rifai: (lista: T[]) => T[]) => {
    const v = piano.aree[area]?.[chiave];
    if (!v || !Array.isArray(v.valore) || giaNellaCommessa(piano, v) || libera(piano, area, chiave)) return;
    if (piano.conflitti.some((c) => c.chiave === chiave)) return;
    const valore = rifai(v.valore as T[]);
    if (!stessoValore(valore, v.valore)) aree[area] = { ...(aree[area] ?? {}), [chiave]: { ...v, valore } };
  };
  riallinea<PersonaDelPiano>("persone", "persone.squadra", (l) => riallineaSquadra(l, fasi, ctx));
  riallinea<DittaDelPiano>("ditte", "ditte.assegnate", (l) => riallineaDitte(l, fasi, ctx));
  riallinea<MezzoDelPiano>("mezzi", "mezzi.allocazioni", (l) => riallineaMezzi(l, fasi, ctx));
  riallinea<OdaDelPiano>("materiali", "materiali.acquisti", (l) => riallineaOrdini(l, fasi, oggi));
  riallinea<ContrattoDelPiano>("ditte", "ditte.contratti", (l) => riallineaContratti(l, fasi));
  riallinea<PromemoriaDelPiano>("sicurezza", "sicurezza.pos_duvri", (l) => riallineaPerTipo(l, promemoria));
  riallinea<AdempimentoDelPiano>("sicurezza", "sicurezza.adempimenti", (l) => riallineaPerTipo(l, adempimenti));
  const avvioAccettato = piano.aree.comunicazione?.["comunicazione.avvio_cliente"];
  if (avvioAccettato && !libera(piano, "comunicazione", "comunicazione.avvio_cliente") && !giaNellaCommessa(piano, avvioAccettato)) {
    const a = avvioAccettato.valore as PromemoriaDelPiano | null;
    if (a && typeof a === "object" && a.scadenza !== avvio.scadenza) {
      const testo = dataInizio ? String(a.testo ?? "").replace(/ dal \d{2}\/\d{2}\./, ` dal ${dataCorta(dataInizio)}.`) : a.testo;
      aree.comunicazione = { ...(aree.comunicazione ?? {}), "comunicazione.avvio_cliente": { ...avvioAccettato, valore: { ...a, scadenza: avvio.scadenza, avviso: avvio.avviso, testo } } };
    }
  }

  if (!Object.keys(aree).length) return null;
  return { fonte: FONTE_RISORSE, aree, costoEur: 0 };
}

/** Quante cose ha pronte il frammento delle risorse, per il messaggio in chat. */
export function riassuntoRisorse(fr: Frammento): string {
  const conta = (area: Area, chiave: string) => {
    const v = fr.aree[area]?.[chiave]?.valore;
    return Array.isArray(v) ? (v as Array<{ stato?: string }>).filter((x) => x?.stato !== "attenzione").length : 0;
  };
  const avvisi = (["persone.squadra", "ditte.assegnate", "mezzi.allocazioni"] as const)
    .reduce((t, k) => {
      const area = k.split(".")[0] as Area;
      const v = fr.aree[area]?.[k]?.valore;
      return t + (Array.isArray(v) ? (v as Array<{ stato?: string }>).filter((x) => x?.stato === "attenzione").length : 0);
    }, 0);
  const pezzi = [
    [conta("persone", "persone.squadra"), "persona", "persone"],
    [conta("ditte", "ditte.assegnate"), "ditta", "ditte"],
    [conta("mezzi", "mezzi.allocazioni"), "mezzo", "mezzi"],
    [conta("materiali", "materiali.acquisti"), "ordine in bozza", "ordini in bozza"],
  ].filter(([n]) => Number(n) > 0).map(([n, uno, tanti]) => `${n} ${n === 1 ? uno : tanti}`);
  if (!pezzi.length && !avvisi) return "Ho preparato i promemoria di sicurezza e il messaggio d'avvio per il cliente, in bozza.";
  return `${pezzi.length ? `Ti propongo ${pezzi.join(", ")}, più le bozze` : "Ti ho preparato le bozze"} di contratti, sicurezza e avvio al cliente.`
    + (avvisi ? ` ⚠ ${avvisi === 1 ? "Uno non è disponibile" : `${avvisi} non sono disponibili`}: te l'ho segnato.` : "")
    + " Niente entra finché non dici «Va bene».";
}

// ── Le offerte delle ditte (4.3: quelle rimaste «da collegare» nella fase 3) ────

/** La richiesta d'offerta a cui un'offerta risponde: una riga di `supplier_rfq_suppliers`. */
export interface RichiestaOfferta {
  /** Id della riga fornitore della richiesta (`rfq_supplier_id`). */
  id: string;
  rfq_number: string | null;
  titolo: string | null;
  supplier_id: string;
  fornitore: string;
  data_fabbisogno?: string | null;
}

/** Quello che restituisce `rdo-ai-estrai-offerta`. */
export interface OffertaLetta {
  righe?: Array<{
    voce_richiesta?: string | null; voce_documento?: string | null; prezzo_unitario?: number | null;
    sconto_percentuale?: number | null; aliquota_iva?: number | null; disponibile?: boolean; quantita?: number | null;
  }>;
  totale_documento?: number | null;
  giorni_consegna?: number | null;
  /** Le voci della richiesta, con le quantità (dalla riga della richiesta). */
}

/**
 * L'offerta letta diventa l'ordine in bozza al suo fornitore, con i prezzi dell'offerta e la
 * data d'ordine dai giorni di consegna che l'offerta dice. La fase è quella che somiglia di più
 * al titolo della richiesta. Fonte `offerta`: vince sulle proposte di Silvio.
 */
export function frammentoDaOfferta(
  offerta: OffertaLetta, richiesta: RichiestaOfferta, piano: PianoCommessa, quantita: Record<string, number> = {}, oggi?: string,
): Frammento {
  const fasi = fasiDiLavoro(piano);
  const titolo = richiesta.titolo ?? "";
  const vociOfferta = (offerta.righe ?? []).map((r) => r.voce_richiesta || r.voce_documento).filter(Boolean);
  // Il titolo di una richiesta può non dire la fase («RDO materiali 2026»): la dicono le voci (G12).
  const fase = fasi
    .map((f) => ({ f, s: somiglianzaFasi(titolo, f.nome) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)[0]?.f
    ?? fasi.find((f) => f.sottofasi.some((s) => vociOfferta.some((v) => stessoNome(v, s.name))))
    ?? null;
  const consegna = fase?.dal ?? (eData(richiesta.data_fabbisogno) ? richiesta.data_fabbisogno! : null);
  const giorni = offerta.giorni_consegna == null ? null : Math.max(0, Math.round(Number(offerta.giorni_consegna)));
  const righe: RigaOda[] = (offerta.righe ?? [])
    .filter((r) => r.disponibile !== false && (r.voce_richiesta || r.voce_documento))
    .map((r) => {
      const descrizione = String(r.voce_richiesta || r.voce_documento).trim();
      const sconto = Math.min(100, Math.max(0, Number(r.sconto_percentuale) || 0));
      const prezzo = r.prezzo_unitario == null ? null : tondo(Number(r.prezzo_unitario) * (1 - sconto / 100));
      return { descrizione, quantita: quantita[descrizione] ?? (Number(r.quantita) > 0 ? Number(r.quantita) : 1), prezzo, iva: r.aliquota_iva ?? null };
    });
  const ordine = dataOrdine(consegna, giorni);
  const fonte: Fonte = {
    tipo: "offerta", id: richiesta.id,
    etichetta: `offerta ${richiesta.fornitore}${richiesta.rfq_number ? ` (${richiesta.rfq_number})` : ""}`,
  };
  const oda: OdaDelPiano = {
    supplier_id: richiesta.supplier_id, fornitore: richiesta.fornitore, fase: fase?.nome ?? null, data_consegna: consegna,
    data_ordine: ordine, giorni_consegna: giorni, righe, offerta_id: richiesta.id, stato: "proposta",
    motivo: `dall'offerta${richiesta.rfq_number ? ` per la richiesta ${richiesta.rfq_number}` : ""}, coi suoi prezzi`,
    avviso: giorni == null ? "l'offerta non dice i tempi di consegna: ordine alla data della consegna" : avvisoOrdine(oggi ?? "0000-00-00", ordine, giorni),
  };
  // Gli altri ordini che il piano ha già (proposti da Silvio o da altre offerte) restano:
  // tenere l'offerta non deve far sparire gli ordini agli altri fornitori.
  const prima = piano.aree.materiali?.["materiali.acquisti"];
  // La voce che l'offerta copre esce dagli altri ordini: la stessa voce non si ordina due volte
  // (revisione 2/11, G12). Se l'altro ordine viene da un'altra offerta, `fondi` apre un conflitto vero.
  const altri = prima && !giaNellaCommessa(piano, prima) && prima.fonte.tipo !== "persona" && Array.isArray(prima.valore)
    ? (prima.valore as OdaDelPiano[]).filter((o) => o.supplier_id !== richiesta.supplier_id).flatMap((o) => {
      if (fase && o.fase && o.fase !== fase.nome) return [o];
      const resto = (o.righe ?? []).filter((r) => !righe.some((x) => stessoNome(x.descrizione, r.descrizione)));
      // Sparisce solo l'ordine rimasto senza righe per colpa dell'offerta.
      return resto.length || !o.righe?.length ? [{ ...o, righe: resto }] : [];
    }) : [];
  const valore: Omit<Valore, "fonte"> = {
    valore: [oda, ...altri], fiducia: 0.9, stato: "proposta",
    nota: "L'ordine in bozza dall'offerta letta: entra se lo confermi, e lo mandi tu dalla pagina dell'ordine.",
  };
  return { fonte, aree: { materiali: { "materiali.acquisti": valore } } };
}
