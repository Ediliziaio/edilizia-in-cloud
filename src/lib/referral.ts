const DEFAULT_REFERRAL_LOGIN_URL = "https://referral.ediliziaincloud.com/referral-login";

type ReferralLinkParams = Record<string, string | number | null | undefined>;

function normalizeReferralLoginUrl(rawUrl: string | null | undefined): string {
  const raw = rawUrl?.trim();
  if (!raw) return DEFAULT_REFERRAL_LOGIN_URL;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    const cleanPath = url.pathname.replace(/\/+$/, "");
    url.pathname = !cleanPath || cleanPath === "/" ? "/referral-login" : cleanPath;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_REFERRAL_LOGIN_URL;
  }
}

export function getReferralLoginUrl(): string {
  const configuredUrl =
    import.meta.env.VITE_REFERRAL_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    import.meta.env.VITE_APP_URL;

  if (configuredUrl) return normalizeReferralLoginUrl(configuredUrl);

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return normalizeReferralLoginUrl(window.location.origin);
    }
  }

  return DEFAULT_REFERRAL_LOGIN_URL;
}

export function buildReferralLink(
  referralCode: string,
  params: ReferralLinkParams = {},
): string {
  // Il link da condividere con un potenziale CLIENTE punta alla landing
  // tracciata /ref/:code (ReferralLanding): registra il click via
  // track-referral-click, salva ref_code + timestamp e porta a /register.
  // Prima puntava a /referral-login ("Accesso riservato ai partner"): un
  // prospect ci finiva su un login sbagliato e il click NON alimentava
  // l'attribuzione. Codice nel PATH, UTM in query. Host = stesso dominio SPA.
  const url = new URL(getReferralLoginUrl());
  url.pathname = `/ref/${encodeURIComponent(referralCode.trim())}`;
  url.search = "";
  url.hash = "";

  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = String(value ?? "").trim();
    if (cleanValue) url.searchParams.set(key, cleanValue);
  });

  return url.toString();
}
