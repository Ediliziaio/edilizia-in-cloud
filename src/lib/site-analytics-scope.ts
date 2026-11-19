import { SITE_ANALYTICS_CONFIG as config } from "./analytics-config";

export function isAnalyticsConfigured() {
  return config.enabled && /^GTM-[A-Z0-9]{4,20}$/.test(config.containerId) && /^G-[A-Z0-9]{5,20}$/.test(config.measurementId) && ![config.containerId, config.measurementId].some(id => /(?:PLACEHOLDER|YOUR|TODO|TBD)|-(?:X+|0+)$/.test(id));
}
export function isAllowedAnalyticsHost() {
  return isAnalyticsConfigured() && typeof window !== "undefined" && window.location.protocol === "https:" && config.allowedHosts.includes(window.location.hostname.toLowerCase());
}
export function isPublicAnalyticsUrl(input: string) {
  if (!isAnalyticsConfigured()) return false;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !config.allowedHosts.includes(url.hostname.toLowerCase())) return false;
    const p = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    if (/@|[\r\n]/.test(p) || /(?:^|[?&])(?:email|e-mail|mail|phone|telephone|telefono|nome|name|firstname|lastname|address|indirizzo|token|access_token|code|password)=/i.test(url.search)) return false;
    const matches = (prefix: string) => prefix === "/" ? p === "/" : p === prefix || p.startsWith(prefix + "/");
    return !config.excludedPathPrefixes.some(matches) && (config.allowedExactPaths.includes(p) || config.allowedPathPrefixes.some(matches));
  } catch { return false; }
}
export function isPublicAnalyticsPage() {
  return typeof window !== "undefined" && isPublicAnalyticsUrl(window.location.href);
}
