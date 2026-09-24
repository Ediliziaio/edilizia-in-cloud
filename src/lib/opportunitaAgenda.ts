/**
 * Appuntamenti e attività da fare di un'opportunità, detti sulla scheda del
 * kanban (24/09/2026, richiesta di Florin).
 *
 * Come per gli Appunti, due icone separate — «gli appuntamenti sono una cosa,
 * le attività sono altre»: sul calendario il numero degli appuntamenti in
 * programma del contatto, sull'icona delle attività quello delle attività da
 * fare di quel contatto in quell'opportunità, rosso se una è già scaduta.
 * Passando col mouse si leggono data, ora, con chi, scadenze e a chi sono
 * assegnate. I conteggi arrivano col resto della scheda (`opportunita_schede`,
 * migrazione 20280924190000); il dettaglio si carica solo quando il riquadro
 * si apre.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface AgendaScheda {
  appuntamenti: number;
  attivita: number;
  scadute: number;
}

/** Il conteggio della scheda; se manca (scheda caricata altrove) vale zero. */
export function leggiAgenda(valore: unknown): AgendaScheda {
  const v = (valore ?? {}) as Partial<Record<keyof AgendaScheda, unknown>>;
  const n = (x: unknown) => {
    const numero = Number(x);
    return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 0;
  };
  return { appuntamenti: n(v.appuntamenti), attivita: n(v.attivita), scadute: n(v.scadute) };
}

/** Il numerino sul calendario: gli appuntamenti in programma, o niente. */
export function badgeAppuntamenti(agenda: AgendaScheda): number | null {
  return agenda.appuntamenti > 0 ? agenda.appuntamenti : null;
}

/** Il numerino sulle attività: quelle da fare, rosso se una è scaduta. */
export function badgeAttivita(agenda: AgendaScheda): { numero: number | null; urgente: boolean } {
  return { numero: agenda.attivita > 0 ? agenda.attivita : null, urgente: agenda.scadute > 0 };
}

/** Oggi a Roma, «2026-09-24»: appuntamenti e scadenze sono giorni italiani, non UTC. */
export function oggiRoma(adesso: Date = new Date()): string {
  return adesso.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function giorniTra(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000);
}

/** «oggi», «domani», «ieri» o «gio 25 set». */
export function giorno(data: string, oggi: string): string {
  const diff = giorniTra(oggi, data);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff === -1) return "ieri";
  return new Date(`${data}T12:00:00Z`).toLocaleDateString("it-IT", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

/** «oggi, 15:30–16:30», «gio 25 set, 09:00», «domani». */
export function quandoAppuntamento(
  a: { appointment_date: string; appointment_time?: string | null; appointment_end_time?: string | null },
  oggi: string,
): string {
  const ora = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
  const inizio = ora(a.appointment_time);
  const fine = ora(a.appointment_end_time);
  const orario = inizio && fine ? `${inizio}–${fine}` : inizio;
  return [giorno(a.appointment_date, oggi), orario].filter(Boolean).join(", ");
}

/** La scadenza di un'attività: «scaduta da 3 giorni», «scade oggi», «entro gio 25 set», «senza scadenza». */
export function scadenzaAttivita(scadenza: string | null | undefined, oggi: string): { testo: string; scaduta: boolean } {
  if (!scadenza) return { testo: "senza scadenza", scaduta: false };
  const diff = giorniTra(oggi, scadenza);
  if (diff < -1) return { testo: `scaduta da ${-diff} giorni`, scaduta: true };
  if (diff === -1) return { testo: "scaduta ieri", scaduta: true };
  if (diff === 0) return { testo: "scade oggi", scaduta: false };
  if (diff === 1) return { testo: "scade domani", scaduta: false };
  return { testo: `entro ${giorno(scadenza, oggi)}`, scaduta: false };
}

/** Gli appuntamenti rimasti fuori dal riquadro: «+1 altro», «+3 altri», o niente. */
export function altriAppuntamenti(totale: number, mostrati: number): string {
  const resto = totale - mostrati;
  if (resto <= 0) return "";
  return resto === 1 ? "+1 altro" : `+${resto} altri`;
}

/**
 * Dopo aver salvato un appuntamento o un'attività: si ricaricano le schede
 * (non i conteggi delle colonne, che non cambiano) e i riquadri, così i numeri
 * sulle icone sono subito giusti. Tutti i riquadri, non solo quello
 * dell'opportunità aperta: gli appuntamenti sono del contatto, e le attività
 * del solo contatto contano su tutte le sue opportunità.
 */
export function aggiornaAgendaSchede(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [...queryKeys.opportunities.all, "fase"] });
  queryClient.invalidateQueries({ queryKey: [...queryKeys.opportunities.all, "lista"] });
  queryClient.invalidateQueries({ queryKey: [...queryKeys.marketingContacts.all, "appuntamenti-preview"] });
  queryClient.invalidateQueries({ queryKey: [...queryKeys.marketingContacts.all, "attivita-preview"] });
}
