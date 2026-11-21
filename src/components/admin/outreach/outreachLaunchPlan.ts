import {
  remainingToday, statoPerPrimiContatti, type SenderState,
} from "../../../../supabase/functions/_shared/outreach-dispatch-logic";
import { finestraDelBrand, fineDelGiorno } from "../../../../supabase/functions/_shared/outreach-schedule";

interface Casella {
  id: string;
  email: string;
  provider: string;
  status: string;
  tetto: number;
  base: number;
  passo: number;
  giorno: number;
  daily_sent: number;
  daily_sent_date: string | null;
  primi_oggi: number;
}
export interface AnteprimaAvvio {
  versione: string;
  blocco: string | null;
  stato: string;
  brand: string | null;
  mittente: string | null;
  risposte_a: string | null;
  nuovi_per_casella: number | null;
  finestra: unknown;
  caselle: Casella[];
  calcolato_il: string;
  destinatari: number;
  invii: number;
  email: number;
  primi_email: number;
  arretrati_email: number;
  arretrati_primi: number;
  prima_email: string | null;
  altri_canali: number;
  chiamate: number;
  esclusi: number;
  cause: Record<string, number>;
}

const GIORNI = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MINUTO = 60_000;
const GIORNO = 24 * 60 * MINUTO;

export function pianoAvvio(d: AnteprimaAvvio) {
  const adesso = new Date(d.calcolato_il);
  const oggi = adesso.toISOString().slice(0, 10);
  const caselle = d.caselle.map((c) => {
    const state: SenderState = {
      id: c.id, status: c.status, daily_cap_target: c.tetto,
      warmup_base: c.base, warmup_step: c.passo, warmup_day: c.giorno,
      daily_sent: c.daily_sent, daily_sent_date: c.daily_sent_date,
    };
    const residuo = remainingToday(state, oggi, oggi);
    const primi = d.nuovi_per_casella && d.nuovi_per_casella > 0
      ? remainingToday(statoPerPrimiContatti(state, d.nuovi_per_casella, c.primi_oggi, oggi, oggi), oggi)
      : residuo;
    return { ...c, residuo, primi };
  });
  const residuo = caselle.reduce((n, c) => n + c.residuo, 0);
  const primi = caselle.reduce((n, c) => n + c.primi, 0);
  const arretratiOggi = Math.min(residuo, d.arretrati_email - d.arretrati_primi + Math.min(primi, d.arretrati_primi));
  const finestra = finestraDelBrand(d.finestra);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: finestra.timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
  } catch {
    return { caselle, residuo, primi, arretratiOggi: 0, prima: null, finestraNonValida: true };
  }
  const domani = Date.parse(oggi + "T00:00:00Z") + GIORNO;
  const inizio = d.prima_email ? Math.max(adesso.getTime(), Date.parse(d.prima_email)) : Number.NaN;
  const primaPossibile = residuo && (primi || d.email > d.primi_email) ? inizio : Math.max(inizio, domani);
  let prima: Date | null = null;
  for (let t = primaPossibile; t < primaPossibile + 8 * GIORNO;) {
    const parts = formatter.formatToParts(t);
    const giorno = GIORNI.indexOf(parts.find((part) => part.type === "weekday")?.value ?? "");
    const ora = Number(parts.find((part) => part.type === "hour")?.value);
    if (finestra.days.includes(giorno) && ora >= finestra.startHour && ora < fineDelGiorno(finestra, giorno)) {
      prima = new Date(t);
      break;
    }
    t = Math.floor(t / (15 * MINUTO) + 1) * 15 * MINUTO;
  }
  return { caselle, residuo, primi, arretratiOggi: prima && prima.getTime() < domani ? arretratiOggi : 0, prima, finestraNonValida: false };
}
