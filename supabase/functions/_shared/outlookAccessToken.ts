import {getEncryptionKey,encrypt,decrypt} from './encryption.ts';
import {getMsOAuthCredentials} from './msOAuth.ts';
const TOKEN_URL="https://login.microsoftonline.com/common/oauth2/v2.0/token";
export async function getOutlookAccessToken(db: any, connectionId: string): Promise<string> {
  const { data: conn } = await db
    .from("outlook_calendar_connections")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error("Connection not found");

  const encKey = getEncryptionKey();
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000 && conn.access_token_encrypted) {
    return await decrypt(conn.access_token_encrypted, encKey);
  }
  if (!conn.refresh_token_encrypted) throw new Error("No refresh token");

  const { clientId, clientSecret } = await getMsOAuthCredentials();
  if (!clientId || !clientSecret) throw new Error("OAuth credentials missing");

  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid profile offline_access User.Read Calendars.ReadWrite",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    // Come per Google: `invalid_grant` significa consenso revocato (la
    // connessione e' finita), tutto il resto e' un intoppo passeggero e non
    // deve marcare la connessione, altrimenti nessun cron riprova piu'.
    const corpo = await res.text().catch(() => "unknown");
    const permanente = /invalid_grant|invalid_client|unauthorized_client/i.test(corpo);
    await db
      .from("outlook_calendar_connections")
      .update({
        last_error: `Refresh token failed: ${corpo.substring(0, 200)}`,
        ...(permanente ? { status: "token_expired" } : {}),
      })
      .eq("id", connectionId);
    throw new Error(`refresh failed: ${corpo}`);
  }
  const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };

  await db.from("outlook_calendar_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : undefined,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", connectionId);

  return tokens.access_token;
}

