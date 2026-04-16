import { safeRedirect } from "@/utils/safeRedirect";

/**
 * Builds a full URL for a given path on a specific subdomain.
 * In local development (localhost), returns just the path (no subdomain switching).
 */
export type TargetSubdomain = "app" | "admin" | "clienti" | "lavori";

export function getSubdomainUrl(path: string, subdomain: TargetSubdomain): string {
  if (typeof window === "undefined") return path;
  const hostname = window.location.hostname;

  // Local dev — no subdomain switching
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("192.168.")) {
    return path;
  }

  // Extract root domain: "admin.ediliziaincloud.com" → "ediliziaincloud.com"
  // Gestisce TLD multi-livello (.co.uk, .com.br, .com.au, etc.)
  const MULTI_LEVEL_TLDS = ["co.uk", "com.br", "co.nz", "co.za", "com.au", "net.au", "org.uk", "me.uk"];
  const parts = hostname.split(".");
  const twoLastParts = parts.slice(-2).join(".");
  const rootDomain = MULTI_LEVEL_TLDS.includes(twoLastParts) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : twoLastParts;
  return `https://${subdomain}.${rootDomain}${path}`;
}

/**
 * Navigates to a path on the specified subdomain.
 * Usa safeRedirect per prevenire Open Redirect (SEC-011).
 * Falls back to in-app navigate() in local dev.
 */
export function navigateToSubdomain(
  path: string,
  subdomain: TargetSubdomain,
  navigateFn?: (path: string) => void
): void {
  const url = getSubdomainUrl(path, subdomain);
  if (url.startsWith("http")) {
    safeRedirect(url);
  } else if (navigateFn) {
    navigateFn(url);
  } else {
    window.location.href = url;
  }
}
