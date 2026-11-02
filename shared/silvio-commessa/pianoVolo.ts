/**
 * Il piano di volo della commessa (1/11/2026, fase 5, lotto 5.3). Vedi
 * docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
 *
 * - 3 giorni lavorativi prima di ogni fase, il controllo: chi è assegnato è ancora libero
 *   (assenze, altre commesse), i mezzi prenotati sono liberi e in servizio, gli ordini della
 *   commessa sono partiti e arrivano in tempo, le ditte hanno il DURC per tutta la fase, e il
 *   meteo di stagione per le fasi all'aperto. Ogni problema ha, quando c'è, l'azione pronta:
 *   assegnare chi è libero, prenotare il mezzo, un'attività («manda l'ordine», «chiedi il DURC»).
 * - Il giorno dopo la fine di una fase, la proposta del SAL, se la commessa ha le rate a SAL:
 *   l'importo della rata di quel SAL, o l'avanzamento delle fasi sul totale meno i SAL già fatti.
 *
 * Le disponibilità sono quelle della fase 4 (`personaOccupata`, `mezzoOccupato`, `documentiDitta`
 * di risorse.ts) sullo stesso `ContestoRisorse`, letto con la commessa esclusa: i suoi impegni
 * non contano come conflitti. Il calendario è quello dell'azienda (calendario.ts).
 *
 * Niente parte da solo: il risultato è una proposta (`silvio_piano_volo`) che la persona
 * conferma dalla commessa. Le azioni che il titolare ha vietato non si propongono.
 *
 * Funzioni pure, senza dipendenze, compatibili con Deno.
 */
import { livelloDi, type Autonomia } from "./autonomia.ts";
import { CALENDARIO_NAZIONALE, lavorativiTra, type CalendarioCantiere } from "./calendario.ts";
import { dataCorta } from "./date.ts";
import { avvisiMeteo, avvisoMeteoInParole } from "./partenza.ts";
import { documentiDitta, mezzoOccupato, personaOccupata, type ContestoRisorse } from "./risorse.ts";
import { piuSimili } from "./somiglianza.ts";

/** Quanti giorni lavorativi prima dell'inizio arriva il controllo. */
export const GIORNI_PRIMA = 3;

export interface FaseInVolo {
  id: string;
  nome: string;
  dal: string | null;
  al: string | null;
}

/** Quello che la commessa ha già per la fase. */
export interface StatoDellaFase {
  persone: { employee_id: string; nome: string }[];
  mezzi: { mezzo_id: string; nome: string }[];
  ditte: { external_team_id: string; nome: string; subappaltatore_id: string | null }[];
  /** Gli ordini della commessa che servono entro la fine della fase. */
  ordini: { id: string; numero: string | null; fornitore: string; stato: string; consegna: string | null }[];
}

export type AreaVolo = "persone" | "mezzi" | "materiali" | "ditte" | "meteo";

export interface ProblemaVolo {
  area: AreaVolo;
  testo: string;
}

/** L'azione pronta: la esegue `silvio_volo_conferma`, mai il cron. */
export type AzioneVolo =
  | { tipo: "assegna_persona"; employee_id: string; nome: string; fase_id: string; motivo: string }
  | { tipo: "prenota_mezzo"; mezzo_id: string; nome: string; fase_id: string; dal: string; al: string | null; motivo: string }
  | { tipo: "attivita"; titolo: string; testo: string; scadenza: string | null }
  | { tipo: "sal_bozza"; numero: number; importo: number; pct_avanzamento_totale: number; motivo: string };

export interface ControlloFase {
  fase: FaseInVolo;
  problemi: ProblemaVolo[];
  azioni: AzioneVolo[];
  /** «Tutto pronto per Scavi dal 12/11», o il riassunto dei problemi. */
  riassunto: string;
}

/** Le fasi da controllare oggi: iniziano fra 1 e GIORNI_PRIMA giorni lavorativi. */
export function fasiDaControllare(fasi: readonly FaseInVolo[], oggi: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): FaseInVolo[] {
  return fasi.filter((f) => {
    if (!f.dal || f.dal <= oggi) return false;
    const n = lavorativiTra(oggi, f.dal, cal);
    return n >= 1 && n <= GIORNI_PRIMA;
  });
}

/** Le fasi finite di recente: l'ultimo giorno è ieri o l'altro ieri (lavorativo). */
export function fasiAppenaFinite(fasi: readonly FaseInVolo[], oggi: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): FaseInVolo[] {
  return fasi.filter((f) => {
    const fine = f.al ?? f.dal;
    if (!fine || fine >= oggi) return false;
    return lavorativiTra(fine, oggi, cal) <= 2;
  });
}

const ARRIVATI = new Set(["ricevuto", "annullato"]);

/** Il controllo di una fase, coi dati di adesso. */
export function controlloFase(
  fase: FaseInVolo, stato: StatoDellaFase, ctx: ContestoRisorse, autonomia: Autonomia | null = null,
): ControlloFase {
  const problemi: ProblemaVolo[] = [];
  const azioni: AzioneVolo[] = [];
  const { dal, al } = fase;
  const quando = dal ? `il ${dataCorta(dal)}` : "presto";
  const puo = (azione: string) => livelloDi(autonomia, azione) !== "vietata";

  // ── Persone ──
  const attivi = new Set(ctx.dipendenti.filter((d) => d.attivo).map((d) => d.id));
  const nome = (id: string) => ctx.dipendenti.find((d) => d.id === id)?.nome ?? "Dipendente";
  const occupati = stato.persone.map((p) => ({ p, motivo: personaOccupata(ctx, p.employee_id, dal, al) })).filter((x) => x.motivo);
  for (const { p, motivo } of occupati) problemi.push({ area: "persone", testo: `${p.nome} ${motivo}.` });
  const liberi = stato.persone.length - occupati.length;
  if (liberi === 0) {
    if (!stato.persone.length) problemi.push({ area: "persone", testo: `Nessuno è assegnato a «${fase.nome}», che parte ${quando}.` });
    if (puo("squadra")) {
      const gia = new Set(stato.persone.map((p) => p.employee_id));
      const storico = ctx.storicoDipendenti.filter((s) => attivi.has(s.employee_id) && !gia.has(s.employee_id))
        .map((s) => ({ id: s.employee_id, nome: s.fase }));
      const candidato = piuSimili(fase.nome, storico).find((c) => !personaOccupata(ctx, c.id, dal, al));
      if (candidato) {
        azioni.push({
          tipo: "assegna_persona", employee_id: candidato.id, nome: nome(candidato.id), fase_id: fase.id,
          motivo: `è libero in quei giorni e ha fatto ${candidato.volte === 1 ? "una fase simile" : `${candidato.volte} fasi simili`} («${candidato.come}»)`,
        });
      }
    }
  }

  // ── Mezzi ──
  for (const m of stato.mezzi) {
    const motivo = mezzoOccupato(ctx, m.mezzo_id, dal, al);
    if (motivo) problemi.push({ area: "mezzi", testo: `${m.nome} ${motivo}.` });
  }
  if (!stato.mezzi.length && dal && puo("mezzi")) {
    const usabili = new Set(ctx.mezzi.map((m) => m.id));
    const storico = ctx.storicoMezzi.filter((s) => usabili.has(s.mezzo_id)).map((s) => ({ id: s.mezzo_id, nome: s.fase }));
    const candidato = piuSimili(fase.nome, storico).find((c) => !mezzoOccupato(ctx, c.id, dal, al));
    if (candidato) {
      const m = ctx.mezzi.find((x) => x.id === candidato.id)!;
      azioni.push({
        tipo: "prenota_mezzo", mezzo_id: m.id, nome: m.nome, fase_id: fase.id, dal, al,
        motivo: `si usa di solito in «${candidato.come}» ed è libero in quei giorni`,
      });
    }
  }

  // ── Materiali: gli ordini della commessa ──
  for (const o of stato.ordini) {
    if (ARRIVATI.has(o.stato)) continue;
    const chi = `L'ordine ${o.numero ?? ""} a ${o.fornitore}`.replace(/\s+/g, " ");
    if (o.stato === "bozza") {
      problemi.push({ area: "materiali", testo: `${chi} è ancora in bozza: non è partito.` });
      azioni.push({ tipo: "attivita", titolo: `Manda l'ordine ${o.numero ?? ""} a ${o.fornitore}`.replace(/\s+/g, " "), scadenza: null,
        testo: `Serve per «${fase.nome}», che parte ${quando}. È in bozza: controllalo e mandalo dalla pagina dell'ordine.` });
    } else if (!o.consegna) {
      problemi.push({ area: "materiali", testo: `${chi} non ha la data di consegna.` });
      azioni.push({ tipo: "attivita", titolo: `Chiedi a ${o.fornitore} quando consegna`, scadenza: null,
        testo: `L'ordine ${o.numero ?? ""} serve per «${fase.nome}», che parte ${quando}, e non ha la data di consegna.` });
    } else if (dal && o.consegna > dal) {
      problemi.push({ area: "materiali", testo: `${chi} arriva il ${dataCorta(o.consegna)}, dopo l'inizio della fase.` });
      azioni.push({ tipo: "attivita", titolo: `Sollecita ${o.fornitore}: consegna prima del ${dataCorta(dal)}`, scadenza: null,
        testo: `L'ordine ${o.numero ?? ""} arriva il ${dataCorta(o.consegna)}, ma «${fase.nome}» parte ${quando}.` });
    }
  }

  // ── Ditte: DURC e documenti per tutta la fase ──
  for (const d of stato.ditte) {
    const motivo = documentiDitta(ctx, { id: d.external_team_id, nome: d.nome, subappaltatore_id: d.subappaltatore_id }, al);
    if (!motivo) continue;
    problemi.push({ area: "ditte", testo: `${d.nome} ${motivo}.` });
    azioni.push({ tipo: "attivita", titolo: `Chiedi a ${d.nome} il DURC e i documenti aggiornati`, scadenza: null,
      testo: `${d.nome} ${motivo}. Senza documenti in regola la ditta non entra in cantiere (${fase.nome}, ${quando}).` });
  }

  // ── Meteo di stagione ──
  for (const a of avvisiMeteo([{ nome: fase.nome, dal, al }])) problemi.push({ area: "meteo", testo: avvisoMeteoInParole(a) });

  const veri = problemi.filter((p) => p.area !== "meteo").length;
  const riassunto = veri === 0
    ? `Tutto pronto per «${fase.nome}» ${quando}${problemi.length ? ", con un avviso meteo" : ""}.`
    : `«${fase.nome}» parte ${quando}: ${veri === 1 ? "una cosa da sistemare" : `${veri} cose da sistemare`}.`;
  return { fase, problemi, azioni, riassunto };
}

// ── Il SAL a fine fase ──────────────────────────────────────────────────────

export interface DatiSal {
  /** Le fasi della commessa, con le durate in giorni lavorativi (o le date). */
  fasi: readonly (FaseInVolo & { giorni?: number | null })[];
  /** La fase appena finita. */
  finita: FaseInVolo;
  /** Imponibile della commessa. */
  totale: number;
  /** L'IVA della commessa, in %: le rate sono ivate, il SAL si propone sull'imponibile. */
  iva?: number | null;
  /** I SAL già fatti (non annullati). */
  salFatti: readonly { numero: number; importo: number }[];
  /** Le rate della commessa: quelle a SAL dicono l'importo del SAL. */
  rate: readonly { trigger_evento: string | null; trigger_numero: number | null; amount: number; label: string }[];
}

const tondo = (n: number) => Math.round(n * 100) / 100;

function durata(f: DatiSal["fasi"][number], cal: CalendarioCantiere): number {
  if (f.giorni && f.giorni > 0) return f.giorni;
  if (f.dal && f.al && f.al >= f.dal) return Math.max(1, lavorativiTra(f.dal, f.al, cal) + 1);
  return 1;
}

/**
 * La proposta del SAL dopo una fase, o null se la commessa non lavora a SAL (nessuna rata a SAL)
 * o se non resta niente da fatturare. Il numero è il prossimo; l'importo, sempre imponibile, è
 * quello della rata di quel SAL senza l'IVA se c'è, altrimenti l'avanzamento (giorni delle fasi
 * finite sul totale) per l'imponibile, meno i SAL già fatti.
 */
export function propostaSal(d: DatiSal, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): Extract<AzioneVolo, { tipo: "sal_bozza" }> | null {
  const aSal = d.rate.filter((r) => r.trigger_evento === "sal_numero");
  if (!aSal.length || !(d.totale > 0) || !d.fasi.length) return null;
  const numero = d.salFatti.reduce((m, s) => Math.max(m, s.numero), 0) + 1;
  const fineFinita = d.finita.al ?? d.finita.dal ?? "";
  const tot = d.fasi.reduce((t, f) => t + durata(f, cal), 0);
  const fatte = d.fasi.filter((f) => (f.al ?? f.dal ?? "9999") <= fineFinita).reduce((t, f) => t + durata(f, cal), 0);
  const pct = tot > 0 ? Math.min(100, Math.round((fatte / tot) * 1000) / 10) : 0;
  const giaFatto = d.salFatti.reduce((t, s) => t + (Number(s.importo) || 0), 0);
  const rata = aSal.find((r) => r.trigger_numero === numero);
  // Una base sola, l'imponibile (revisione 1/11, L6): la rata è ivata e va scorporata, come
  // l'avanzamento è sul totale senza IVA. Prima la rata entrava ivata e il resto no.
  const iva = typeof d.iva === "number" && d.iva >= 0 ? d.iva : 0;
  const importo = rata ? tondo(rata.amount / (1 + iva / 100)) : tondo(d.totale * (pct / 100) - giaFatto);
  if (!(importo > 0)) return null;
  return {
    tipo: "sal_bozza", numero, importo, pct_avanzamento_totale: pct,
    motivo: rata
      ? `«${d.finita.nome}» è finita: la rata «${rata.label}» è il SAL n. ${numero}.`
      : `«${d.finita.nome}» è finita: le fasi fatte sono il ${String(pct).replace(".", ",")} % dei lavori, meno i SAL già emessi.`,
  };
}
