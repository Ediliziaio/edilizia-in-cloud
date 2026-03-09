import { getPlatformSetting } from "./getPlatformSetting.ts";

/** Obtain a fresh GoCardless access token using platform_settings credentials */
export async function getGoCardlessToken(): Promise<string> {
  const secretId = await getPlatformSetting("bank_gocardless_secret_id");
  const secretKey = await getPlatformSetting("bank_gocardless_secret_key");

  if (!secretId || !secretKey) {
    throw new Error("Credenziali GoCardless non configurate");
  }

  const res = await fetch("https://bankaccountdata.gocardless.com/api/v2/token/new/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.detail || body?.summary || "Token GoCardless fallito");
  }

  return body.access;
}

/** Wrapper for GoCardless API calls with automatic 401 retry (re-fetches token) */
export async function gcFetch(
  path: string,
  token: string,
  options: RequestInit = {},
  retry = true,
): Promise<{ data: any; token: string }> {
  const baseUrl = "https://bankaccountdata.gocardless.com/api/v2";
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && retry) {
    const newToken = await getGoCardlessToken();
    return gcFetch(path, newToken, options, false);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.summary || `GoCardless API error ${res.status}`);
  }

  return { data, token };
}

/** Advanced transaction categorization with 11+ categories */
export function categorizeTransaction(
  description: string,
  creditorName: string,
  amount?: number,
): { category: string; icon: string } {
  const text = `${description || ""} ${creditorName || ""}`.toUpperCase();

  if (/STIPEND|SALARI|PAGA\b|EMOLUMENT|BUSTA\s*PAGA/.test(text))
    return { category: "Stipendi", icon: "Users" };

  if (/AFFITT|LOCAZION|CANONE\s*LOC/.test(text))
    return { category: "Affitti", icon: "Home" };

  if (/FORNI|SUPPLIER|MERCE|MATERIALI/.test(text))
    return { category: "Fornitori", icon: "Package" };

  if (/F24|TRIBUT|AGENZIA\s*ENTRAT|TASS[AEI]|IMPOST|IVA\b|INPS|INAIL/.test(text))
    return { category: "Tasse & Tributi", icon: "FileText" };

  if (/UTENZ|ENEL|ENI\b|LUCE|GAS\b|ACQUA|TELECOM|TIM\b|VODAFONE|FASTWEB|WIND/.test(text))
    return { category: "Utenze", icon: "Zap" };

  if (/ASSICURAZ|POLIZZA|PREMIO\s*ASS|UNIPOL|GENERALI|ALLIANZ|AXA\b/.test(text))
    return { category: "Assicurazioni", icon: "Shield" };

  if (/RISTORAN|BAR\b|CAFF[EÈ]|PIZZ|MENSA|FOOD/.test(text))
    return { category: "Ristorazione", icon: "UtensilsCrossed" };

  if (/TRASFER|VIAGGIO|TRENO|AEREO|HOTEL|ALBERGO|BENZIN|CARBURANT|AUTOSTR|PEDAGGIO/.test(text))
    return { category: "Trasferte", icon: "Plane" };

  if (/BANCOMAT|COMMISSIONI|SPESE\s*BANCARI|BONIFICO\s*COMMISSI/.test(text))
    return { category: "Bancario", icon: "Landmark" };

  if (/FATTUR|RICAV|INCASSO|PAGAMENTO\s*CLIENTE/.test(text))
    return { category: "Clienti", icon: "TrendingUp" };

  // Check if it's a credit (income) without other categorization
  if (amount != null && amount > 0)
    return { category: "Entrata", icon: "ArrowDownLeft" };

  return { category: "Non categorizzata", icon: "HelpCircle" };
}

/** Utility: sleep for ms */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
