type Ambiente = (chiave: string) => string | undefined;
export type TokenNativo = { id: string; user_id: string; token: string; platform: string };
type Contenuto = { url?: string; tag?: string };
type Esito = "inviata" | "scaduta" | "errore";
let tokenApple: { identificatore: string; creato: number; valore: Promise<string> } | undefined;

function credenzialiAndroid(env: Ambiente) {
  try {
    const { project_id, client_email, private_key } = JSON.parse(env("FCM_SERVICE_ACCOUNT_JSON") ?? "{}");
    return typeof project_id === "string" && /^[a-z0-9-]+$/.test(project_id)
      && typeof client_email === "string" && typeof private_key === "string"
      ? { project_id, client_email, private_key } : null;
  } catch { return null; }
}

function credenzialiApple(env: Ambiente) {
  const team = env("APNS_TEAM_ID");
  const chiave = env("APNS_KEY_ID");
  const privata = env("APNS_PRIVATE_KEY");
  return team && chiave && privata
    ? { team, chiave, privata, sandbox: env("APNS_ENVIRONMENT") === "sandbox" } : null;
}

export function pushNativeConfigurate(env: Ambiente) {
  return { android: !!credenzialiAndroid(env), ios: !!credenzialiApple(env) };
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firmaJwt(alg: "RS256" | "ES256", pem: string, header: Record<string, string>, claims: Record<string, string | number>) {
  const encoder = new TextEncoder();
  const codifica = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));
  const dati = `${codifica({ alg, ...header })}.${codifica(claims)}`;
  const der = Uint8Array.from(atob(pem.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----|\s+/g, "")), c => c.charCodeAt(0));
  const algoritmo = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("pkcs8", der, algoritmo, false, ["sign"]);
  const firma = await crypto.subtle.sign(algoritmo, key, encoder.encode(dati));
  return `${dati}.${base64Url(new Uint8Array(firma))}`;
}

function indirizzo(url: string | undefined) {
  return typeof url === "string" && url.length < 1500 && /^\/(?!\/)/.test(url) && !/[\\\x00-\x1f\x7f]/.test(url)
    ? url : "/";
}

export async function preparaInvioNativo(piattaforma: string, env: Ambiente, richiesta: typeof fetch = fetch) {
  const now = Math.floor(Date.now() / 1000);
  // Sul telefono bloccato basta l'avviso generico. Il dettaglio resta nell'area autenticata.
  const notifica = { title: "Edilizia in Cloud", body: "Hai una nuova notifica." };
  const dati = (destinatario: TokenNativo, contenuto: Contenuto) => ({
    user_id: destinatario.user_id, url: indirizzo(contenuto.url),
  });

  if (piattaforma === "android") {
    const sa = credenzialiAndroid(env);
    if (!sa) return null;
    const oauth = "https://oauth2.googleapis.com/token";
    const assertion = await firmaJwt("RS256", sa.private_key, { typ: "JWT" }, {
      iss: sa.client_email, aud: oauth, scope: "https://www.googleapis.com/auth/firebase.messaging", iat: now, exp: now + 600,
    });
    const token = await richiesta(oauth, {
      method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!token.ok) throw new Error(`OAuth Firebase HTTP ${token.status}`);
    const accessToken = (await token.json()).access_token;
    if (!accessToken) throw new Error("OAuth Firebase senza token");
    return async (destinatario: TokenNativo, contenuto: Contenuto): Promise<Esito> => {
      const res = await richiesta(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST", signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token: destinatario.token, notification: notifica, data: dati(destinatario, contenuto),
          android: { priority: "high", notification: { channel_id: "campo", tag: contenuto.tag?.slice(0, 100) } },
        } }),
      });
      if (res.ok) return "inviata";
      const errore = await res.json().catch((): null => null);
      const dettagli = errore?.error?.details;
      return Array.isArray(dettagli) && dettagli.some(d => d?.errorCode === "UNREGISTERED") ? "scaduta" : "errore";
    };
  }

  if (piattaforma !== "ios") return null;
  const sa = credenzialiApple(env);
  if (!sa) return null;
  const identificatore = `${sa.team}:${sa.chiave}`;
  if (tokenApple?.identificatore !== identificatore || now - tokenApple.creato >= 2400) {
    tokenApple = { identificatore, creato: now, valore: firmaJwt("ES256", sa.privata, { kid: sa.chiave }, { iss: sa.team, iat: now }) };
  }
  const autorizzazione = tokenApple;
  const jwt = await autorizzazione.valore.catch(errore => {
    if (tokenApple === autorizzazione) tokenApple = undefined;
    throw errore;
  });
  const host = sa.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return async (destinatario: TokenNativo, contenuto: Contenuto): Promise<Esito> => {
    const tag = contenuto.tag;
    const headers = {
      authorization: `bearer ${jwt}`, "apns-topic": "com.ediliziaincloud.app", "apns-push-type": "alert",
      "apns-expiration": String(now + 86400), "Content-Type": "application/json",
      ...(tag && /^[A-Za-z0-9:_-]{1,64}$/.test(tag) ? { "apns-collapse-id": tag } : {}),
    };
    const res = await richiesta(`https://${host}/3/device/${encodeURIComponent(destinatario.token)}`, {
      method: "POST", headers, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ aps: { alert: notifica, sound: "default" }, ...dati(destinatario, contenuto) }),
    });
    if (res.ok) return "inviata";
    return res.status === 410 ? "scaduta" : "errore";
  };
}
