/**
 * Builds a full URL for a given path on a specific subdomain.
 * In local development (localhost), returns just the path (no subdomain switching).
 */
export function getSubdomainUrl(path: string, subdomain: "app" | "admin" | "clienti"): string {
  if (typeof window === "undefined") return path;
  const hostname = window.location.hostname;

  // Local dev — no subdomain switching
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("192.168.")) {
    return path;
  }

  // Extract root domain: "admin.ediliziaincloud.com" → "ediliziaincloud.com"
  const parts = hostname.split(".");
  const rootDomain = parts.slice(-2).join(".");
  return `https://${subdomain}.${rootDomain}${path}`;
}

/**
 * Navigates to a path on the specified subdomain.
 * Uses window.location.href for cross-subdomain navigation (triggers full reload).
 * Falls back to in-app navigate() in local dev.
 */
export function navigateToSubdomain(
  path: string,
  subdomain: "app" | "admin" | "clienti",
  navigateFn?: (path: string) => void
): void {
  const url = getSubdomainUrl(path, subdomain);
  if (url.startsWith("http")) {
    window.location.href = url;
  } else if (navigateFn) {
    navigateFn(url);
  } else {
    window.location.href = url;
  }
}
