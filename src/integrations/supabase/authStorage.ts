/**
 * Dove vive la sessione: un cookie sul dominio comune, non la memoria del
 * singolo sito.
 *
 * IL PROBLEMA (10/09/2026, segnalato dal founder)
 * ----------------------------------------------
 * `app.ediliziaincloud.com` e `admin.ediliziaincloud.com` sono due origini
 * diverse: il `localStorage` di una non esiste per l'altra. Chi faceva login
 * su admin e la mattina dopo apriva app trovava la schermata di accesso, pur
 * avendo una sessione valida — verificato sul vivo: un refresh token fermo da
 * 18 ore veniva ancora rinnovato dal server, quindi non era scaduto niente,
 * semplicemente il browser lo cercava nel posto sbagliato. Ci si metteva anche
 * l'uscita da un'azienda impersonata, che faceva un logout locale su app.
 *
 * COME FUNZIONA
 * -------------
 * Un cookie su `.ediliziaincloud.com` è visibile a tutti i sottodomini, quindi
 * un accesso solo vale ovunque. La sessione di Supabase può superare i 4 KB
 * che un cookie regge, così viene spezzata in più cookie numerati — come fa la
 * libreria ufficiale per il rendering lato server.
 *
 * PERCHÉ SCRIVE ANCHE IN localStorage
 * -----------------------------------
 * È la rete di sicurezza: se il cookie non si potesse scrivere (dominio
 * inatteso, anteprima su *.pages.dev, browser che li blocca), l'applicazione
 * continua a funzionare esattamente come prima invece di lasciare tutti fuori.
 * In lettura il cookie ha la precedenza; se manca, si legge la memoria locale e
 * — quando il dominio lo permette — la sessione trovata lì viene copiata nel
 * cookie, così chi era già dentro non deve rifare login nemmeno una volta.
 */

const DOMINIO_CONDIVISO = ".ediliziaincloud.com";
/**
 * Sotto i 4 KB che un cookie regge, e con pochi pezzi: i cookie viaggiano in
 * OGNI richiesta verso il dominio, e Cloudflare rifiuta con 400 le richieste
 * con header troppo grandi. Una sessione tipica sta in 2-4 KB, cioè un pezzo o
 * due; oltre i tre pezzi si rinuncia al cookie e si resta sulla memoria locale
 * (il caso non deve capitare, ma meglio un login in più che il sito che
 * risponde 400 a tutti).
 */
const MAX_PER_COOKIE = 3_000;
const MAX_PEZZI = 3;
const GIORNI = 45;

function dominioPerCookie(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  // Solo sul dominio vero: su localhost e sulle anteprime un cookie con
  // `domain` non verrebbe accettato, e senza fallback si perderebbe la sessione.
  if (host === "ediliziaincloud.com" || host.endsWith(".ediliziaincloud.com")) {
    return DOMINIO_CONDIVISO;
  }
  return null;
}

function leggiCookie(nome: string): string | null {
  if (typeof document === "undefined") return null;
  const cercato = `${encodeURIComponent(nome)}=`;
  for (const pezzo of document.cookie.split("; ")) {
    if (pezzo.startsWith(cercato)) return decodeURIComponent(pezzo.slice(cercato.length));
  }
  return null;
}

function scriviCookie(nome: string, valore: string, dominio: string): void {
  const scadenza = new Date(Date.now() + GIORNI * 864e5).toUTCString();
  document.cookie =
    `${encodeURIComponent(nome)}=${encodeURIComponent(valore)}; ` +
    `Domain=${dominio}; Path=/; Expires=${scadenza}; SameSite=Lax; Secure`;
}

function cancellaCookie(nome: string, dominio: string): void {
  document.cookie =
    `${encodeURIComponent(nome)}=; Domain=${dominio}; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

function nomePezzo(chiave: string, i: number): string {
  return `${chiave}.${i}`;
}

/** Rimette insieme i pezzi; null se il primo non c'è. */
function leggiDaCookie(chiave: string): string | null {
  const intero = leggiCookie(chiave);
  if (intero) return intero;
  const primo = leggiCookie(nomePezzo(chiave, 0));
  if (!primo) return null;
  let valore = primo;
  for (let i = 1; i < MAX_PEZZI; i++) {
    const pezzo = leggiCookie(nomePezzo(chiave, i));
    if (pezzo === null) break;
    valore += pezzo;
  }
  return valore;
}

function scriviSuCookie(chiave: string, valore: string, dominio: string): void {
  // Il valore intero non serve più: si scrive sempre a pezzi numerati, e il
  // cookie senza numero (formato vecchio) viene tolto per non leggerlo per
  // sbaglio al posto di quello nuovo.
  cancellaCookie(chiave, dominio);
  const pezzi: string[] = [];
  for (let i = 0; i < valore.length; i += MAX_PER_COOKIE) {
    pezzi.push(valore.slice(i, i + MAX_PER_COOKIE));
  }
  if (pezzi.length > MAX_PEZZI) {
    // Sessione anomala (troppo grande): meglio la sola memoria locale che un
    // cookie tagliato a metà, che al ricaricamento sembrerebbe valido e non lo è.
    for (let i = 0; i < MAX_PEZZI; i++) cancellaCookie(nomePezzo(chiave, i), dominio);
    return;
  }
  pezzi.forEach((p, i) => scriviCookie(nomePezzo(chiave, i), p, dominio));
  for (let i = pezzi.length; i < MAX_PEZZI; i++) {
    if (leggiCookie(nomePezzo(chiave, i)) !== null) cancellaCookie(nomePezzo(chiave, i), dominio);
  }
}

function cancellaDaCookie(chiave: string, dominio: string): void {
  cancellaCookie(chiave, dominio);
  for (let i = 0; i < MAX_PEZZI; i++) cancellaCookie(nomePezzo(chiave, i), dominio);
}

export const authStorage = {
  getItem(chiave: string): string | null {
    const dominio = dominioPerCookie();
    if (dominio) {
      const daCookie = leggiDaCookie(chiave);
      if (daCookie !== null) return daCookie;
    }
    let daLocale: string | null = null;
    try {
      daLocale = localStorage.getItem(chiave);
    } catch { /* storage negato: si prosegue senza */ }
    // Chi era già dentro prima di questa modifica: la sessione passa nel
    // cookie senza che debba rifare login.
    if (daLocale !== null && dominio) scriviSuCookie(chiave, daLocale, dominio);
    return daLocale;
  },

  setItem(chiave: string, valore: string): void {
    const dominio = dominioPerCookie();
    if (dominio) {
      try {
        scriviSuCookie(chiave, valore, dominio);
      } catch { /* cookie negati: resta la memoria locale */ }
    }
    try {
      localStorage.setItem(chiave, valore);
    } catch { /* ignore */ }
  },

  removeItem(chiave: string): void {
    const dominio = dominioPerCookie();
    if (dominio) {
      try {
        cancellaDaCookie(chiave, dominio);
      } catch { /* ignore */ }
    }
    try {
      localStorage.removeItem(chiave);
    } catch { /* ignore */ }
  },
};

/** I nomi dei cookie/chiavi che contengono una sessione Supabase. */
function chiaviSessione(): string[] {
  const chiavi = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("sb-") && k.includes("auth-token")) chiavi.add(k);
    }
  } catch { /* storage negato */ }
  if (typeof document !== "undefined") {
    for (const pezzo of document.cookie.split("; ")) {
      const nome = decodeURIComponent(pezzo.split("=")[0] ?? "");
      if (nome.startsWith("sb-") && nome.includes("auth-token")) {
        // "sb-xxx-auth-token.1" → "sb-xxx-auth-token"
        chiavi.add(nome.replace(/\.\d+$/, ""));
      }
    }
  }
  return [...chiavi];
}

/**
 * C'e' una sessione salvata da qualche parte?
 *
 * Serve a chi decide, prima ancora di parlare con Supabase, se mostrare la
 * landing o portare l'utente nel gestionale. Da quando la sessione vive nel
 * cookie di dominio, guardare solo la memoria locale non basta: chi arriva su
 * app.* dopo aver fatto login su admin.* ha il cookie ma non la memoria, e si
 * vedrebbe comparire la landing per un istante prima del rimbalzo.
 */
export function sessioneSalvataPresente(): boolean {
  for (const chiave of chiaviSessione()) {
    const valore = authStorage.getItem(chiave);
    if (valore && valore.length > 50) return true;
  }
  return false;
}

/**
 * Butta via ogni sessione salvata, cookie compresi.
 *
 * La usano le routine di recupero quando il token e' corrotto o non piu' valido
 * ("Invalid Refresh Token"): se si pulisse la sola memoria locale, il cookie
 * rimetterebbe in circolo la stessa sessione rotta al ricaricamento successivo,
 * e non se ne uscirebbe piu'.
 */
export function cancellaSessioniSalvate(): void {
  for (const chiave of chiaviSessione()) authStorage.removeItem(chiave);
}

export const _perTest = { dominioPerCookie, leggiDaCookie, scriviSuCookie, chiaviSessione, MAX_PER_COOKIE, MAX_PEZZI };
