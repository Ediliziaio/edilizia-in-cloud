import { useEffect } from "react";
import { SITE_ANALYTICS_CONFIG } from "@/lib/analytics-config";
import { isAllowedAnalyticsHost } from "@/lib/site-analytics-scope";

type Choice = { analytics: boolean; marketing: boolean };
type Boundary = { install: (config: typeof SITE_ANALYTICS_CONFIG) => unknown; getState: () => { publicPage: boolean } };
type Runtime = { configure: (config: unknown) => unknown; updateConsent: (choice: Choice) => unknown };
type AnalyticsWindow = Window & { EICAnalytics?: Runtime; EICAnalyticsBoundary?: Boundary };

function decode(value: unknown): Choice | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (c.v !== 1 || typeof c.il !== "number" || Date.now() - c.il >= 182 * 86400000 || Date.now() < c.il || typeof c.analitici !== "boolean" || typeof c.marketing !== "boolean") return null;
  return { analytics: c.analitici, marketing: c.marketing };
}
function persistedChoice(): Choice | null {
  try { return decode(JSON.parse(localStorage.getItem("eic_consenso_cookie") || "null")); }
  catch { return null; }
}
function readChoice(): Choice { return persistedChoice() ?? { analytics: false, marketing: false }; }
function localScript(src: string, id: string, available: () => boolean): Promise<void> {
  if (available()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.getElementById(id) as HTMLScriptElement | null;
    const isNew = !script;
    if (!script) { script = document.createElement("script"); script.id = id; script.src = src; script.async = true; }
    script.addEventListener("load", () => available() ? resolve() : reject(new Error("Analytics runtime unavailable")), { once: true });
    script.addEventListener("error", () => reject(new Error("Analytics runtime unavailable")), { once: true });
    if (isNew) document.head.appendChild(script);
  });
}

/** Loads the public/private boundary first. GTM owns every Google page view. */
export function SiteAnalytics(): null {
  useEffect(() => {
    if (!isAllowedAnalyticsHost()) return;
    const w = window as AnalyticsWindow;
    let disposed = false;
    let pending = readChoice();
    let failedRevocation = false;
    const sync = () => {
      if (disposed || !w.EICAnalyticsBoundary?.getState().publicPage) return;
      w.EICAnalytics?.configure({ ...SITE_ANALYTICS_CONFIG, reloadOnRevoke: !failedRevocation && SITE_ANALYTICS_CONFIG.reloadOnRevoke, allowedPathPrefixes: [...SITE_ANALYTICS_CONFIG.allowedExactPaths, ...SITE_ANALYTICS_CONFIG.allowedPathPrefixes] });
      w.EICAnalytics?.updateConsent(failedRevocation ? { analytics: false, marketing: false } : pending);
    };
    const changed = (event: Event) => {
      const selected = decode((event as CustomEvent<unknown>).detail);
      // A failed storage write must not reload and resurrect a previous grant.
      if (selected?.analytics === false && persistedChoice()?.analytics !== false) failedRevocation = true;
      pending = selected ?? readChoice(); sync();
    };
    const stored = (event: StorageEvent) => { if (event.key === "eic_consenso_cookie" || event.key === null) { pending = readChoice(); sync(); } };
    window.addEventListener("eic:consenso-cookie", changed);
    window.addEventListener("storage", stored);
    void (async () => {
      await localScript("/analytics-boundary.js", "eic-analytics-boundary", () => !!w.EICAnalyticsBoundary);
      if (disposed) return;
      w.EICAnalyticsBoundary?.install(SITE_ANALYTICS_CONFIG);
      if (!w.EICAnalyticsBoundary?.getState().publicPage) return;
      await localScript("/analytics-loader.js", "eic-analytics-runtime", () => !!w.EICAnalytics);
      sync();
    })().catch(() => { /* Measurement must never prevent use of the site or app. */ });
    return () => { disposed = true; window.removeEventListener("eic:consenso-cookie", changed); window.removeEventListener("storage", stored); };
  }, []);
  return null;
}
