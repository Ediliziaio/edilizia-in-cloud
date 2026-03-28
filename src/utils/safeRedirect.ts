/**
 * Utility per redirect sicuri — previene Open Redirect verso domini non autorizzati.
 * SEC-011: Validazione URL prima di window.location.href
 */

// Domini trusted verso cui è consentito il redirect
const ALLOWED_REDIRECT_DOMAINS = [
  "ediliziaincloud.it",
  "www.ediliziaincloud.it",
  "app.ediliziaincloud.it",
  "stripe.com",
  "checkout.stripe.com",
  "billing.stripe.com",
  "connect.stripe.com",
];

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

    // Verifica che il dominio sia nella whitelist
    const isAllowed = ALLOWED_REDIRECT_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
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
