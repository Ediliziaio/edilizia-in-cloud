/**
 * Come si leggono i numeri della Dashboard Call Center. `null` vuol dire «non misurabile»: una pagina
 * che scrive 0% dove nessuno ha registrato niente dice una cosa falsa sull'operatore.
 */
import type { NumeriCallCenter } from "@/hooks/useCallCenterDashboard";

/** Sotto questa quota di appuntamenti con esito, la percentuale di presenza non vuol dire niente. */
export const QUOTA_MINIMA_ESITI = 0.5;

export function percentuale(parte: number, totale: number): number | null {
  if (!totale) return null;
  return Math.round((1000 * parte) / totale) / 10;
}

export function presenza(n: NumeriCallCenter): number | null {
  const conEsito = n.svolti_presentati + n.svolti_assenti;
  if (!n.svolti_totale || conEsito / n.svolti_totale < QUOTA_MINIMA_ESITI) return null;
  return percentuale(n.svolti_presentati, conEsito);
}

export function indicatori(n: NumeriCallCenter) {
  return {
    contatto: percentuale(n.contatti_raggiunti, n.contatti_chiamati),
    appSuRaggiunti: percentuale(n.appuntamenti_fissati, n.contatti_raggiunti),
    appSuAssegnati: percentuale(n.lead_con_appuntamento, n.lead_assegnati),
    entro5Min: percentuale(n.entro_5_min, n.lead_chiamati),
    chiamateAlGiorno: n.giorni_attivi ? Math.round((10 * n.chiamate) / n.giorni_attivi) / 10 : null,
    tentativiPerContatto: n.contatti_chiamati ? Math.round((10 * n.chiamate) / n.contatti_chiamati) / 10 : null,
    presenza: presenza(n),
  };
}

export function formattaMinuti(minuti: number | null): string {
  if (minuti == null) return "—";
  if (minuti < 60) return `${Math.round(minuti)} min`;
  if (minuti < 60 * 24) return `${Math.round(minuti / 6) / 10} ore`;
  return `${Math.round(minuti / 144) / 10} giorni`;
}
