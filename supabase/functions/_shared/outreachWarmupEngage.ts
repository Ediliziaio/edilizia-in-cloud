/**
 * outreachWarmupEngage — engagement REALE del warm-up sulle caselle OAuth:
 * le email delle altre caselle del pool finite nello spam tornano in inbox e
 * vengono segnate come lette (Gmail API con gmail.modify, Microsoft Graph con
 * Mail.ReadWrite). Senza questo il warm-up e' solo traffico in uscita.
 */
// deno-lint-ignore-file no-explicit-any
import { getOauthAccessToken } from "./outreachMailboxSend.ts";

export interface EngageEsito { recuperate: number; lette: number; errore?: string }

async function gmailList(token: string, q: string): Promise<string[]> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail_list_${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json() as { messages?: Array<{ id: string }> };
  return (j.messages ?? []).map((m) => m.id);
}
async function gmailModify(token: string, id: string, add: string[], remove: string[]): Promise<void> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
  if (!r.ok) throw new Error(`gmail_modify_${r.status}: ${(await r.text()).slice(0, 160)}`);
}

async function graph(token: string, path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok && r.status !== 204 && r.status !== 201) throw new Error(`graph_${r.status}: ${(await r.text()).slice(0, 160)}`);
  if (r.status === 204) return null;
  return await r.json().catch(() => null);
}

export async function engageMailbox(admin: any, box: { email: string; provider: string; oauth_connection_id?: string | null }, poolEmails: string[]): Promise<EngageEsito> {
  const esito: EngageEsito = { recuperate: 0, lette: 0 };
  if (!box.oauth_connection_id) return { ...esito, errore: "nessuna connessione OAuth" };
  const altri = poolEmails.filter((e) => e !== box.email.toLowerCase()).slice(0, 15);
  if (altri.length === 0) return esito;
  const { accessToken } = await getOauthAccessToken(admin, box.oauth_connection_id);

  if (box.provider === "gmail") {
    const from = `from:(${altri.join(" OR ")})`;
    for (const id of await gmailList(accessToken, `${from} in:spam newer_than:3d`)) {
      await gmailModify(accessToken, id, ["INBOX"], ["SPAM"]); esito.recuperate++;
    }
    for (const id of await gmailList(accessToken, `${from} is:unread newer_than:3d`)) {
      await gmailModify(accessToken, id, [], ["UNREAD"]); esito.lette++;
    }
    return esito;
  }

  // Outlook / Microsoft 365
  const filtro = altri.map((e) => `from/emailAddress/address eq '${e.replace(/'/g, "''")}'`).join(" or ");
  const junk = await graph(accessToken, `/me/mailFolders/junkemail/messages?$top=25&$select=id&$filter=${encodeURIComponent(`(${filtro})`)}`);
  for (const m of (junk?.value ?? []) as Array<{ id: string }>) {
    await graph(accessToken, `/me/messages/${m.id}/move`, { method: "POST", body: JSON.stringify({ destinationId: "inbox" }) });
    esito.recuperate++;
  }
  const unread = await graph(accessToken, `/me/mailFolders/inbox/messages?$top=25&$select=id&$filter=${encodeURIComponent(`isRead eq false and (${filtro})`)}`);
  for (const m of (unread?.value ?? []) as Array<{ id: string }>) {
    await graph(accessToken, `/me/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
    esito.lette++;
  }
  return esito;
}
