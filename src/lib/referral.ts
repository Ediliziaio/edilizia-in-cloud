const DEFAULT_REFERRAL_LOGIN_URL = "https://app.ediliziaincloud.com/login";

type ReferralLinkParams = Record<string, string | number | null | undefined>;

function normalizeReferralLoginUrl(rawUrl: string | null | undefined): string {
  const raw = rawUrl?.trim();
  if (!raw) return DEFAULT_REFERRAL_LOGIN_URL;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    const cleanPath = url.pathname.replace(/\/+$/, "");
    url.pathname = !cleanPath || cleanPath === "/" ? "/login" : cleanPath;
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
  const url = new URL(getReferralLoginUrl());
  url.searchParams.set("ref", referralCode.trim());

  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = String(value ?? "").trim();
    if (cleanValue) url.searchParams.set(key, cleanValue);
  });

  return url.toString();
}
