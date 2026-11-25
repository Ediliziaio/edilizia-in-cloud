/**
 * «Questa app è vecchia»: il confronto, in un posto solo e senza effetti.
 *
 * Perché serve. Il 25/11/2026 un operaio non vedeva i cantieri: la correzione era in
 * produzione da ore, ma la sua app girava codice di tre giorni prima e nessuno dei due
 * poteva saperlo. Due motivi, entrambi invisibili da dentro:
 *  - l'app installata (iOS/Android) porta il codice DENTRO di sé (`webDir: dist`): un
 *    push su main non la aggiorna, mai, finché non si ricostruisce e si pubblica;
 *  - sul web la pagina di /campo si prende dalla rete con quattro secondi di pazienza
 *    (service worker, NetworkFirst): in cantiere, con una tacca, resta quella salvata.
 *
 * Come funziona. Il bundle sa da quale commit viene (`__EIC_BUILD__`, messo da
 * vite.config). Il sito serve `/versione-minima.json` con la data minima accettabile,
 * che si alza A MANO e solo quando una correzione cambia quello che l'operaio vede o può
 * fare. Il confronto sta qui; chi lo chiama è `useVersioneApp`.
 *
 * Regola della soglia a mano: l'app installata è SEMPRE un po' indietro rispetto al web,
 * che esce più volte al giorno. Un avviso a ogni differenza sarebbe acceso sempre, quindi
 * nessuno lo leggerebbe. Si alza la soglia quando l'avviso vale la pena, non prima.
 */

/** Data del commit di questo bundle, o stringa vuota se il bundle non la porta (test). */
export const BUILD_APP: string = typeof __EIC_BUILD__ === "string" ? __EIC_BUILD__ : "";

export interface VersioneMinima {
  /** Data ISO del commit più vecchio ancora considerato buono. */
  minima?: string | null;
}

/**
 * Dice se l'app va aggiornata. Nel dubbio risponde `false`: un avviso sbagliato in
 * cantiere costa più del silenzio, e la data può mancare (build fuori da git, file non
 * ancora pubblicato, risposta illeggibile).
 */
export function appDaAggiornare(build: string | null | undefined, minima: string | null | undefined): boolean {
  if (!build || !minima) return false;
  const miaData = Date.parse(build);
  const minimaData = Date.parse(minima);
  if (Number.isNaN(miaData) || Number.isNaN(minimaData)) return false;
  return miaData < minimaData;
}

/** Legge la soglia da una risposta già decodificata, senza fidarsi della forma. */
export function minimaDa(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object") return null;
  const valore = (corpo as VersioneMinima).minima;
  return typeof valore === "string" && valore.trim() !== "" ? valore : null;
}

/** Il sito che pubblica la soglia. */
export const SITO_APP = "https://app.ediliziaincloud.com";

/**
 * L'indirizzo da cui si legge la soglia.
 *
 * Nell'app installata DEVE essere assoluto: la WebView gira su `https://localhost` e
 * serve i file del pacchetto, quindi `/versione-minima.json` sarebbe la COPIA interna,
 * scritta quando l'app è stata costruita. L'app si troverebbe sempre d'accordo con se
 * stessa e non avviserebbe mai — proprio nel caso per cui è nata (il codice dentro il
 * pacchetto non si aggiorna con un deploy). Da un'altra origine serve il permesso CORS:
 * sta in `public/_headers`.
 *
 * Sul web resta relativo, così vale su ogni dominio (anteprime comprese).
 */
export function urlVersioneMinima(nativa: boolean): string {
  return `${nativa ? SITO_APP : ""}/versione-minima.json`;
}

/**
 * Butta via tutto quello che il telefono ha salvato dell'app e la riapre. Serve solo sul
 * web: nell'app installata il codice sta nel pacchetto, e si aggiorna dallo store.
 * Non fallisce mai: se togliere il service worker o le cache non va, ricarica comunque.
 */
export async function svuotaERiapri(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrazioni = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrazioni.map((r) => r.unregister()));
    }
  } catch {
    // Service worker non raggiungibile: si ricarica comunque.
  }
  try {
    if ("caches" in globalThis) {
      const chiavi = await caches.keys();
      await Promise.all(chiavi.map((k) => caches.delete(k)));
    }
  } catch {
    // Cache non raggiungibile: si ricarica comunque.
  }
  const indirizzo = new URL(window.location.href);
  // Lo stesso segnale che usa lo script di ripristino in index.html.
  indirizzo.searchParams.set("__fresh", "1");
  indirizzo.searchParams.set("__recovery", Date.now().toString());
  window.location.replace(indirizzo.toString());
}
