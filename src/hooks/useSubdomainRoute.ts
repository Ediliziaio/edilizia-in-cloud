/**
 * Detects the current subdomain and returns routing configuration.
 *
 * Subdomain → Section mapping:
 *   www              → landing page (marketing)
 *   app              → main company app (default)
 *   admin            → super-admin panel
 *   clienti          → customer portal
 *   lavori           → field/work portal
 *   commercialista   → accountant/studio portal
 *   <anything else>  → treated like "app" (white-label or unknown)
 */

import { isMobileAppRuntime } from "@/lib/mobile/platform";

export type AppSubdomain = "www" | "app" | "admin" | "clienti" | "lavori" | "commercialista" | "other";

export interface SubdomainConfig {
  subdomain: AppSubdomain;
  /** The default path to redirect to when visiting "/" */
  defaultPath: string;
  /** Login page path for this subdomain */
  loginPath: string;
  /** Title shown in the browser tab */
  title: string;
}

const SUBDOMAIN_MAP: Record<string, SubdomainConfig> = {
  www: {
    subdomain: "www",
    defaultPath: "/",
    loginPath: "/login",
    title: "Edilizia in Cloud",
  },
  admin: {
    subdomain: "admin",
    defaultPath: "/admin/dashboard",
    loginPath: "/admin-login",
    title: "Admin — Edilizia in Cloud",
  },
  clienti: {
    subdomain: "clienti",
    defaultPath: "/cliente/ordini",
    loginPath: "/clienti-login",
    title: "Portale Clienti — Edilizia in Cloud",
  },
  lavori: {
    subdomain: "lavori",
    defaultPath: "/campo",
    loginPath: "/lavori-login",
    title: "Area Lavori — Edilizia in Cloud",
  },
  commercialista: {
    subdomain: "commercialista",
    defaultPath: "/commercialista",
    loginPath: "/login",
    title: "Portale Commercialista — Edilizia in Cloud",
  },
  app: {
    subdomain: "app",
    defaultPath: "/",
    loginPath: "/login",
    title: "Edilizia in Cloud",
  },
};

const DEFAULT_CONFIG: SubdomainConfig = {
  subdomain: "other",
  defaultPath: "/",
  loginPath: "/login",
  title: "Edilizia in Cloud",
};

/** Returns the current subdomain string (e.g. "app", "admin", "www", "clienti") */
export function getCurrentSubdomain(): string {
  if (typeof window === "undefined") return "app";
  const hostname = window.location.hostname;

  // Dentro iOS/Android Capacitor il bundle gira su localhost, ma non è il
  // sito marketing: è sempre l'app operativa. La root deve quindi portare al
  // login/redirect ruoli, non alla homepage pubblica.
  if (isMobileAppRuntime) {
    return "app";
  }

  // Local marketing/SEO preview — match the public www site at the root.
  // Protected app routes remain available by explicit path (for example /azienda).
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "www";
  }

  // Extract the first segment: "admin.ediliziaincloud.com" → "admin"
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    return parts[0].toLowerCase();
  }

  // Bare domain (e.g. ediliziaincloud.com) — treat as "www"
  if (parts.length === 2) {
    return "www";
  }

  return "app";
}

/** Returns the full subdomain config for the current hostname */
export function useSubdomainRoute(): SubdomainConfig {
  const sub = getCurrentSubdomain();
  return SUBDOMAIN_MAP[sub] ?? DEFAULT_CONFIG;
}

/** True when the current subdomain should ONLY show admin routes */
export function isAdminSubdomain(): boolean {
  return getCurrentSubdomain() === "admin";
}

/** True when the current subdomain should ONLY show customer portal routes */
export function isClientiSubdomain(): boolean {
  return getCurrentSubdomain() === "clienti";
}

/** True when the current subdomain is the landing/marketing page */
export function isWwwSubdomain(): boolean {
  return getCurrentSubdomain() === "www";
}

/** True quando il subdomain è l'area lavori (operai/subappaltatori) */
export function isLavoriSubdomain(): boolean {
  return getCurrentSubdomain() === "lavori";
}

/** True quando il subdomain è il portale studio commercialista */
export function isCommercialistaSubdomain(): boolean {
  return getCurrentSubdomain() === "commercialista";
}
