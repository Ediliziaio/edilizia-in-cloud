/**
 * Quando chiedere il permesso degli avvisi (02/11/2026). All'apertura dell'app nessuno lo dava:
 * si chiede dopo la prima timbratura, quando il promemoria del rapportino ha un senso.
 * Su iPhone, dentro Safari, le notifiche non esistono: prima va aggiunta alla schermata Home.
 */
export type RichiestaAvvisi = "attiva" | "aggiungi_home" | null;

export function richiestaAvvisi(i: {
  permesso: "default" | "granted" | "denied" | "unsupported";
  iscritto: boolean;
  iPhoneNelBrowser: boolean;
  /** L'operaio ha timbrato oggi; il subappaltatore non timbra e vale sempre. */
  momentoGiusto: boolean;
}): RichiestaAvvisi {
  if (!i.momentoGiusto || i.iscritto || i.permesso === "denied") return null;
  if (i.permesso === "unsupported") return i.iPhoneNelBrowser ? "aggiungi_home" : null;
  return "attiva";
}

export function eIPhoneNelBrowser(ua: string, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/.test(ua) && !standalone;
}
