/**
 * Utility per redirect sicuri — previene Open Redirect verso domini non autorizzati.
 * SEC-011: Validazione URL prima di window.location.href
 *
 * I domini trusted vengono derivati DINAMICAMENTE dal dominio corrente a runtime,
 * così funziona sia su ediliziaincloud.com che su ediliziaincloud.it o qualsiasi
 * altro dominio/staging, senza dover aggiornare una whitelist hardcoded.
 */

// Terze parti sempre consentite (pagamenti)
const ALWAYS_ALLOWED_DOMAINS = [
  "stripe.com",
  "checkout.stripe.com",
  "billing.stripe.com",
  "connect.stripe.com",
];

/**
 * Ricava il root domain dal hostname corrente.
 * Es: "admin.ediliziaincloud.com" → "ediliziaincloud.com"
 *     "localhost"                  → "localhost"
 */
function getCurrentRootDomain(): string {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  // localhost / IP — dominio radice coincide con l'hostname
  if (hostname === "localhost" || hostname === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }
  // Rimuove il primo segmento (sottodominio) se presente
  const parts = hostname.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
}

/**
 * Esegue un redirect sicuro solo verso domini trusted.
 * Per URL relativi (es. "/azienda/impostazioni"), il redirect è sempre consentito.
 *
 * @param url - URL di destinazione (assoluto o relativo)
 * @param fallback - URL di fallback se la validazione fallisce (default: "/")
 */
export function safeRedirect(url: string, fallback = "/"): void {
  if (!url) {
    console.error("[safeRedirect] URL vuoto, redirect al fallback:", fallback);
    window.location.href = fallback;
    return;
  }

  // URL relativo — sempre sicuro
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
    window.location.href = url;
    return;
  }

  // URL assoluto — verifica il dominio
  try {
    const parsed = new URL(url);

    // Solo https consentito (mai http o altri protocolli)
    if (parsed.protocol !== "https:") {
      console.error("[safeRedirect] Protocollo non consentito:", parsed.protocol, "→ redirect al fallback");
      window.location.href = fallback;
      return;
    }

    const rootDomain = getCurrentRootDomain();

    // Consenti qualsiasi sottodominio del dominio corrente + le terze parti nella lista fissa
    const isOwnDomain =
      rootDomain !== "" &&
      (parsed.hostname === rootDomain || parsed.hostname.endsWith(`.${rootDomain}`));

    const isThirdParty = ALWAYS_ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    if (!isOwnDomain && !isThirdParty) {
      console.error("[safeRedirect] Dominio non autorizzato:", parsed.hostname, "→ redirect al fallback");
      window.location.href = fallback;
      return;
    }

    window.location.href = url;
  } catch {
    console.error("[safeRedirect] URL non valido:", url, "→ redirect al fallback");
    window.location.href = fallback;
  }
}
