/**
 * Il piano dei tempi di una commessa senza cronoprogramma del preventivo (17/11/2026).
 *
 * Una commessa creata direttamente dal computo ha fasi e voci (quantità, unità), ma nessun
 * cronoprogramma: «Pianifica» non aveva da dove partire. Qui le durate si stimano dalle voci
 * (ore come «Calcola come finire»: costo di manodopera, poi la resa di partenza del gestionale) e
 * le fasi si mettono in sequenza di cantiere, con le lavorazioni che si accavallano come in un
 * cantiere vero: la successiva parte a metà della precedente.
 *
 * - Durata della fase = quella del mestiere più lungo: ore del mestiere ÷ (sua squadra tipica × ore utili al giorno).
 * - Sicurezza e opere provvisionali coprono tutto il cantiere.
 * - Ordine: rimozioni → strutture → coperture → impianti → serramenti → cappotto e facciate →
 *   finiture interne → fotovoltaico e accumulo → collaudi. Stesso posto, in parallelo.
 */
import { IPOTESI_PREDEFINITE, oreDellaVoce, type Ipotesi } from "../../../shared/piano-cantiere/calcolo.ts";
import { resaDiPartenza } from "../../../shared/piano-cantiere/resePartenza.ts";
import type { FasePiano } from "./pianoDalCronoprogramma";

export interface FaseDaPianificare { nome: string; position?: number | null }
export interface VoceDaPianificare { fase: string; descrizione: string; unita: string | null; quantita: number | null; costo_manodopera?: number | null; importo?: number | null }

export interface StimaFase { nome: string; ore: number; squadra: number; giorni: number; rango: number; tuttoIlCantiere: boolean; vociStimate: number; vociSenzaDati: number }

const senzaAccenti = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const SEQUENZA: readonly { rango: number; parole: RegExp }[] = [
  { rango: 1, parole: /(rimozion|demoli|smontagg|sgomber)/ },
  { rango: 2, parole: /(struttur|consolidament|sismic|calcestruzz|solai)/ },
  { rango: 3, parole: /(copertur|tett|manto|lattoner|sottotett|terrazz)/ },
  { rango: 6, parole: /(fotovolt|accumul.*(elettric|batteri)|impianto di accumulo|colonnin|ricarica|wallbox)/ },
  // Prima del controllo degli impianti: «isolamento termico» è involucro, non impianto termico.
  { rango: 5.5, parole: /(cappott|isolament|facciat|involucr|opach)/ },
  { rango: 4, parole: /(impiant|termic|idraul|elettric|climatizz|vmc|ventilaz|riscaldament)/ },
  { rango: 5, parole: /(serrament|infiss|finestr|schermatur|oscurant)/ },
  { rango: 7, parole: /(controsoff|cartongess|paviment|tinteggi|finitur|intern)/ },
  { rango: 8, parole: /(collaud|consegn|pulizi)/ },
]
const TUTTO_IL_CANTIERE = /(sicurezza|cantierizz|opere provvisional|ponteg|apprestament)/;

/** Il posto nella sequenza: dal nome della fase; solo se il nome non dice niente, dalle sue voci. */
function rangoDi(nome: string, testoVoci: string): number {
  const dalNome = SEQUENZA.find((s) => s.parole.test(senzaAccenti(nome)));
  if (dalNome) return dalNome.rango;
  return SEQUENZA.find((s) => s.parole.test(senzaAccenti(testoVoci)))?.rango ?? 5;
}

export function stimaFasi(fasi: FaseDaPianificare[], voci: VoceDaPianificare[], ipotesi: Partial<Ipotesi> = {}): StimaFase[] {
  const ip: Ipotesi = { ...IPOTESI_PREDEFINITE, ...ipotesi };
  const oreUtili = ip.oreGiorno * (ip.resaPct / 100);
  return [...fasi].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((f) => {
    const suo = voci.filter((v) => v.fase.trim() === f.nome.trim());
    // Mestieri diversi della stessa fase (facciatisti e copertura nell'involucro) lavorano in parallelo:
    // la fase dura quanto il mestiere più lungo, ognuno con la sua squadra tipica.
    const perMestiere = new Map<string, { ore: number; squadra: number }>();
    let ore = 0, stimate = 0, senza = 0;
    for (const v of suo) {
      const o = oreDellaVoce({ fase: f.nome, capitolo: null, descrizione: v.descrizione, unita: v.unita, quantita: Number(v.quantita) || 0,
        importo: v.importo ?? null, costo_manodopera: v.costo_manodopera ?? null, costo_materiali: null, ore_previste: null, incidenza: null, origine: "fase" }, ip);
      if (!o) { senza++; continue; }
      ore += o.ore;
      if (o.fonte === "partenza") stimate++;
      const resa = resaDiPartenza(v.descrizione, v.unita);
      const m = perMestiere.get(resa?.mestiere ?? "generico") ?? { ore: 0, squadra: resa?.squadra ?? 3 };
      m.ore += o.ore;
      perMestiere.set(resa?.mestiere ?? "generico", m);
    }
    const durate = [...perMestiere.values()].map((m) => ({ giorni: m.ore / (m.squadra * oreUtili), squadra: m.squadra }));
    const lungo = durate.reduce((a, b) => (b.giorni > a.giorni ? b : a), { giorni: 0, squadra: 3 });
    const tuttoIlCantiere = TUTTO_IL_CANTIERE.test(senzaAccenti(f.nome));
    return {
      nome: f.nome, ore: Math.round(ore), squadra: durate.reduce((t, d) => t + d.squadra, 0) || lungo.squadra,
      rango: tuttoIlCantiere ? 0 : rangoDi(f.nome, suo.map((v) => v.descrizione).join(" ").slice(0, 400)),
      giorni: ore > 0 ? Math.max(1, Math.ceil(lungo.giorni)) : 0, tuttoIlCantiere, vociStimate: stimate, vociSenzaDati: senza,
    };
  });
}

/** Prima dei lavori: rilievi, progetto esecutivo, approvazione schede e ordini (4-8 settimane). */
export const FASE_AVVIO = "Rilievi, progetto esecutivo e ordini";
/** In fondo: avviamenti, prove, documenti, pulizia e smontaggio dei ponteggi (3-5 settimane). */
export const FASE_CHIUSURA = "Collaudi, consegna e smobilizzo";
const GIORNI_AVVIO = 25;
/** I lavori di cantiere partono durante l'avvio, dopo rilievi e primi ordini. */
const LAVORI_DAL = 21;
/** Serramenti su misura: produzione 8-12 settimane dalla conferma delle misure. */
const PRODUZIONE_SU_MISURA = 50;
const GIORNI_CHIUSURA = 20;

/**
 * Le fasi in sequenza di cantiere: stesso rango in parallelo, il rango dopo parte a metà del
 * precedente; i serramenti non prima della loro produzione. Con un cantiere di più di due mesi
 * si aggiungono avvio (rilievi e ordini) e chiusura (collaudi): «Pianifica» le crea come fasi.
 */
export function pianoDalleStime(stime: StimaFase[]): FasePiano[] {
  const lavori = stime.filter((s) => !s.tuttoIlCantiere && s.giorni > 0);
  const lungo = lavori.reduce((t, s) => t + s.giorni, 0) > 40;
  const ranghi = [...new Set(lavori.map((s) => s.rango))].sort((a, b) => a - b);
  const inizio = new Map<number, number>();
  let giorno = lungo ? LAVORI_DAL : 1;
  let fine = 0;
  for (const r of ranghi) {
    const su = lungo && r === 5 ? Math.max(giorno, 1 + PRODUZIONE_SU_MISURA) : giorno;
    inizio.set(r, su);
    const durata = Math.max(...lavori.filter((s) => s.rango === r).map((s) => s.giorni));
    fine = Math.max(fine, su + durata - 1);
    giorno = su + Math.max(1, Math.ceil(durata / 2));
  }
  const fineLavori = Math.max(fine, 1);
  const totale = lungo ? fineLavori + GIORNI_CHIUSURA : fineLavori;
  const fasi: FasePiano[] = stime
    .filter((s) => s.tuttoIlCantiere || s.giorni > 0)
    .map((s) => s.tuttoIlCantiere
      ? { nome: s.nome, giornoInizio: 1, giorni: totale }
      : { nome: s.nome, giornoInizio: inizio.get(s.rango) ?? 1, giorni: s.giorni });
  if (!lungo) return fasi;
  const ci = (nome: string) => stime.some((s) => s.nome.trim().toLowerCase() === nome.toLowerCase());
  return [
    ...(ci(FASE_AVVIO) ? [] : [{ nome: FASE_AVVIO, giornoInizio: 1, giorni: GIORNI_AVVIO }]),
    ...fasi,
    ...(ci(FASE_CHIUSURA) ? [] : [{ nome: FASE_CHIUSURA, giornoInizio: fineLavori + 1, giorni: GIORNI_CHIUSURA }]),
  ];
}
