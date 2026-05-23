export type GoogleAdsAccountSetupInput = {
  companyId: string;
  integrationId: string | null;
  customerId: string;
  customerName?: string | null;
  managerCustomerId?: string | null;
  currency?: string | null;
  timeZone?: string | null;
  isManager?: boolean;
  isTestAccount?: boolean;
};

export type GoogleAdsAccountPayload = {
  company_id: string;
  integration_id: string | null;
  customer_id: string;
  customer_name: string | null;
  manager_customer_id: string | null;
  currency: string;
  time_zone: string;
  is_manager: boolean;
  is_test_account: boolean;
  selected: boolean;
};

export type GoogleAdsReadinessCheckKey =
  | "customer_id"
  | "integration"
  | "offline_conversions"
  | "api_credentials";

export type GoogleAdsReadinessCheck = {
  key: GoogleAdsReadinessCheckKey;
  label: string;
  status: "ok" | "warning" | "blocked";
  detail: string;
};

export type GoogleAdsReadinessInput = {
  integrationConnected: boolean;
  hasSelectedAccount: boolean;
  hasValidCustomerId: boolean;
  hasApiCredentials: boolean;
  hasOfflineConversionQueue: boolean;
  pendingOfflineEvents: number | null;
};

export type GoogleAdsContactAttributionInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
};

export type GoogleAdsContactAttributionUpdate = {
  source: "Google Ads";
  source_campaign_id: string | null;
  attr_source: string | null;
  attr_medium: string | null;
  attr_campaign: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  google_campaign_id: string | null;
};

export function normalizeGoogleCustomerId(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidGoogleCustomerId(value: string | null | undefined): boolean {
  return normalizeGoogleCustomerId(value).length === 10;
}

export function formatGoogleCustomerId(value: string | null | undefined): string {
  const normalized = normalizeGoogleCustomerId(value);
  if (normalized.length !== 10) return "";
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildGoogleAdsAccountPayload(input: GoogleAdsAccountSetupInput): GoogleAdsAccountPayload {
  const customerId = normalizeGoogleCustomerId(input.customerId);
  const managerCustomerId = normalizeGoogleCustomerId(input.managerCustomerId);

  return {
    company_id: input.companyId,
    integration_id: input.integrationId,
    customer_id: customerId,
    customer_name: cleanText(input.customerName),
    manager_customer_id: managerCustomerId.length > 0 ? managerCustomerId : null,
    currency: cleanText(input.currency) ?? "EUR",
    time_zone: cleanText(input.timeZone) ?? "Europe/Rome",
    is_manager: Boolean(input.isManager),
    is_test_account: Boolean(input.isTestAccount),
    selected: true,
  };
}

export function buildGoogleAdsReadinessChecks(input: GoogleAdsReadinessInput): GoogleAdsReadinessCheck[] {
  const pendingLabel =
    input.pendingOfflineEvents === null
      ? "Coda non verificata"
      : `${input.pendingOfflineEvents} eventi in attesa`;

  return [
    {
      key: "customer_id",
      label: "Customer ID",
      status: input.hasValidCustomerId ? "ok" : "blocked",
      detail: input.hasValidCustomerId
        ? "Account Google Ads identificato"
        : "Inserisci il Customer ID a 10 cifre dell'account Google Ads",
    },
    {
      key: "integration",
      label: "Account selezionato",
      status: input.integrationConnected && input.hasSelectedAccount ? "ok" : "blocked",
      detail:
        input.integrationConnected && input.hasSelectedAccount
          ? "Collegamento salvato in azienda"
          : "Salva un account Google Ads prima di creare campagne live",
    },
    {
      key: "offline_conversions",
      label: "Conversioni offline",
      status: input.hasOfflineConversionQueue ? "ok" : "warning",
      detail: input.hasOfflineConversionQueue
        ? `${pendingLabel} da inviare quando l'API sara configurata`
        : "Applica la migration della coda conversioni per collegare vendite e appuntamenti",
    },
    {
      key: "api_credentials",
      label: "API Google Ads",
      status: input.hasApiCredentials ? "ok" : "warning",
      detail: input.hasApiCredentials
        ? "Credenziali server pronte per sync e publish"
        : "Richiede Developer Token e OAuth server per publish, stats live e upload conversioni",
    },
  ];
}

export function buildGoogleAdsContactAttributionUpdate(
  input: GoogleAdsContactAttributionInput,
): GoogleAdsContactAttributionUpdate | null {
  const source = cleanText(input.utmSource);
  const medium = cleanText(input.utmMedium);
  const campaign = cleanText(input.utmCampaign);
  const gclid = cleanText(input.gclid);
  const wbraid = cleanText(input.wbraid);
  const gbraid = cleanText(input.gbraid);
  const normalizedSource = source?.toLowerCase() ?? "";
  const normalizedMedium = medium?.toLowerCase() ?? "";
  const paidMedium = ["cpc", "ppc", "paid_search"].includes(normalizedMedium);
  const isPaidGoogle =
    Boolean(gclid || wbraid || gbraid) ||
    ["google_ads", "adwords"].includes(normalizedSource) ||
    (normalizedSource === "google" && paidMedium);

  if (!isPaidGoogle) return null;

  return {
    source: "Google Ads",
    source_campaign_id: campaign,
    attr_source: source,
    attr_medium: medium,
    attr_campaign: campaign,
    ...(gclid ? { gclid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(gbraid ? { gbraid } : {}),
    google_campaign_id: campaign,
  };
}
